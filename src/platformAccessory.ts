import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import wol from 'wake_on_lan';
import { DEFAULT_INPUTS, RegzaDeviceConfig, RegzaInputConfig } from './settings';
import { RegzaClient } from './regzaClient';
import { RemoteKeys } from './remoteKeys';
import { probeMediaRenderer } from './ssdpPowerProbe';
import type { RegzaPlatform } from './platform';

export function shouldPrepareOperationWake(
  powerMode: RegzaDeviceConfig['powerMode'],
  idleMs: number,
  thresholdMs: number,
): boolean {
  return powerMode === 'discrete' && idleMs >= thresholdMs;
}

export function getBroadcastInputKey(channel: string): string {
  if (channel.startsWith('JP-G0004')) {
    return RemoteKeys.BS;
  }
  if (channel.startsWith('JP-G0006') || channel.startsWith('JP-G0007')) {
    return RemoteKeys.CS;
  }
  return RemoteKeys.TERRESTRIAL;
}

function matchesInputKey(configuredKey: string, expectedKey: string): boolean {
  const aliases: Record<string, string[]> = {
    [RemoteKeys.TERRESTRIAL]: ['terrestrial'],
    [RemoteKeys.BS]: ['bs'],
    [RemoteKeys.CS]: ['cs'],
    [RemoteKeys.HDMI_NEXT_ACTIVE]: ['hdmiNextActive'],
  };
  return configuredKey.toUpperCase() === expectedKey.toUpperCase()
    || (aliases[expectedKey] ?? []).some(alias => configuredKey.toLowerCase() === alias.toLowerCase());
}

export function findInputIdentifier(inputs: RegzaInputConfig[], expectedKey: string): number | undefined {
  const index = inputs.findIndex(input => matchesInputKey(input.key, expectedKey));
  if (index === -1) {
    return undefined;
  }
  return inputs[index].identifier ?? index + 1;
}

export function isPlaybackDefinitelyActive(status: number, contentType: string): boolean {
  return status === 0 && contentType === 'broadcast';
}

export function getStatusPollDelayMs(intervalSeconds: number, consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) {
    return intervalSeconds * 1000;
  }
  const backoffSeconds = [60, 120, 300, 600][Math.min(consecutiveFailures - 1, 3)];
  return Math.max(intervalSeconds, backoffSeconds) * 1000;
}

export function isConnectivityFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as NodeJS.ErrnoException).code;
  return ['EHOSTUNREACH', 'ENETUNREACH', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(code ?? '')
    || /timed out|couldn't connect|failed to connect/i.test(error.message);
}

export function shouldConfirmOffAfterConnectivityFailures(consecutiveFailures: number): boolean {
  return consecutiveFailures >= 3;
}

export function shouldConfirmOffAfterSsdpMisses(consecutiveMisses: number): boolean {
  return consecutiveMisses >= 3;
}

export function getRecorderPlayPauseKey(currentlyPaused: boolean): 'play' | 'pause' {
  return currentlyPaused ? 'play' : 'pause';
}

export function getPlayPauseKey(
  currentlyPaused: boolean,
): 'play' | 'pause' {
  return getRecorderPlayPauseKey(currentlyPaused);
}

export function shouldAutoCloseNavigationMenu(deviceType: RegzaDeviceConfig['deviceType']): boolean {
  // Recorder menus can transition directly into playback. Sending Back from a
  // timer would then interrupt playback, so recorder navigation only resets
  // the plugin's internal routing state.
  return deviceType !== 'recorder';
}

export type RecorderPowerStep = 'linkedTvOn' | 'recorderMenu' | 'delay' | 'recorderToggle';

export function getRecorderPowerSteps(
  shouldBeActive: boolean,
  powerOnLinkedTv: boolean,
  hasLinkedTv: boolean,
  normalizeOff: boolean,
): RecorderPowerStep[] {
  if (shouldBeActive) {
    return [
      'recorderMenu',
      ...(powerOnLinkedTv && hasLinkedTv ? ['linkedTvOn' as const] : []),
    ];
  }
  return normalizeOff
    ? ['recorderMenu', 'delay', 'recorderToggle']
    : ['recorderToggle'];
}

export function shouldContinueRecorderOffNormalization(
  linkedTvIp: string | undefined,
  linkedTvActive: boolean | undefined,
): boolean {
  return linkedTvIp === undefined || linkedTvActive === false;
}

export function shouldSkipPowerRequest(
  deviceType: RegzaDeviceConfig['deviceType'],
  requestedActive: boolean,
  currentActive: boolean,
): boolean {
  // A recorder state is optimistic. Always execute its convergence sequence,
  // even when HomeKit already displays the requested state.
  return deviceType !== 'recorder' && requestedActive === currentActive;
}

export type NavigationLayer = 'viewing' | 'menu' | 'dateSelection';

export function getNavigationLayerAfterDateSelection(
  currentLayer: NavigationLayer,
): NavigationLayer {
  return currentLayer === 'dateSelection' ? 'menu' : currentLayer;
}

export class RegzaTvAccessory {
  private readonly client: RegzaClient;
  private readonly volumeClient: RegzaClient;
  private readonly linkedTvClient?: RegzaClient;
  private readonly linkedTvIp?: string;
  private recorderPowerOperation: Promise<void> = Promise.resolve();
  private recorderPowerGeneration = 0;
  private readonly tvService: Service;
  private readonly speakerService?: Service;
  private active = false;
  private muted = false;
  private currentInput = 1;
  private powerProbeRunning = false;
  private powerProbeFailureCount = 0;
  private powerProbeConnectivityFailureCount = 0;
  private powerStateConfirmedAt = 0;
  private lastUserOperationAt = 0;
  private statusPollFailureCount = 0;
  private ssdpRendererMissCount = 0;
  private statusPollRunning?: Promise<boolean>;
  private statusPollTimer?: NodeJS.Timeout;
  private navigationModeActive = false;
  private navigationLayer: NavigationLayer = 'viewing';
  private navigationSelectionMade = false;
  private navigationTimer?: NodeJS.Timeout;
  private stalePowerProbeTimer?: NodeJS.Timeout;
  private muteOperationQueue: Promise<void> = Promise.resolve();
  private operationWakeRunning?: Promise<void>;
  private playbackPaused = false;

  constructor(
    private readonly platform: RegzaPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly device: RegzaDeviceConfig,
    volumeControlDevice?: RegzaDeviceConfig,
  ) {
    this.client = new RegzaClient({
      log: platform.log,
      name: device.name,
      ip: device.ip,
      username: device.username,
      password: device.password,
      port: device.port,
      protocol: device.protocol,
      allowSelfSignedCertificate: device.allowSelfSignedCertificate,
      debugEnabled: Boolean(platform.config.debug),
      keyMap: device.keyMap,
      timeoutMs: device.requestTimeoutMs,
      powerMode: device.powerMode,
      powerOnKey: device.powerOnKey,
      powerOffKey: device.powerOffKey,
      powerToggleKey: device.powerToggleKey ?? device.powerKey,
      remoteResponseMode: device.remoteResponseMode,
    });
    this.linkedTvClient = volumeControlDevice
      ? new RegzaClient({
        log: platform.log,
        name: volumeControlDevice.name,
        ip: volumeControlDevice.ip,
        username: volumeControlDevice.username,
        password: volumeControlDevice.password,
        port: volumeControlDevice.port,
        protocol: volumeControlDevice.protocol,
        allowSelfSignedCertificate: volumeControlDevice.allowSelfSignedCertificate,
        debugEnabled: Boolean(platform.config.debug),
        keyMap: volumeControlDevice.keyMap,
        timeoutMs: volumeControlDevice.requestTimeoutMs,
        powerMode: volumeControlDevice.powerMode,
        powerOnKey: volumeControlDevice.powerOnKey,
        powerOffKey: volumeControlDevice.powerOffKey,
        powerToggleKey: volumeControlDevice.powerToggleKey ?? volumeControlDevice.powerKey,
        remoteResponseMode: volumeControlDevice.remoteResponseMode,
      })
      : undefined;
    this.volumeClient = this.linkedTvClient ?? this.client;
    this.linkedTvIp = volumeControlDevice?.ip;
    if (
      this.device.deviceType === 'recorder' &&
      this.linkedTvIp &&
      this.device.recorderPowerOffWithLinkedTv !== false
    ) {
      this.platform.registerLinkedRecorderPowerOff(
        this.linkedTvIp,
        this.device.recorderLinkedTvOffDelaySeconds ?? 5,
        () => this.setRecorderActive(false),
      );
    }

    this.platform.log.info(`Initializing REGZA accessory: ${device.name} (ip=${device.ip}, mac=${device.mac ? 'configured' : 'not configured'}, username=${device.username ? 'configured' : 'missing'}, password=${device.password ? 'configured' : 'missing'})`);

    this.accessory.getService(this.platform.Service.AccessoryInformation)
      ?.setCharacteristic(this.platform.Characteristic.Name, device.name)
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'TVS REGZA / Toshiba')
      .setCharacteristic(this.platform.Characteristic.Model, device.model ?? 'REGZA App Connect')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.mac ?? device.ip);

    this.tvService = this.accessory.getService(this.platform.Service.Television)
      ?? this.accessory.addService(this.platform.Service.Television, device.name, 'television');
    this.tvService.setPrimaryService();

    if (device.supportsVolumeControl !== false || volumeControlDevice !== undefined) {
      this.speakerService = this.accessory.getService(this.platform.Service.TelevisionSpeaker)
        ?? this.accessory.addService(this.platform.Service.TelevisionSpeaker, `${device.name} Speaker`, 'speaker');
    } else {
      const staleSpeaker = this.accessory.getService(this.platform.Service.TelevisionSpeaker);
      if (staleSpeaker) {
        this.tvService.removeLinkedService(staleSpeaker);
        this.accessory.removeService(staleSpeaker);
      }
    }

    this.active = accessory.context.active === true;
    this.muted = accessory.context.muted === true;
    this.currentInput = typeof accessory.context.currentInput === 'number' ? accessory.context.currentInput : 1;
    this.lastUserOperationAt = typeof accessory.context.lastUserOperationAt === 'number'
      ? accessory.context.lastUserOperationAt
      : Date.now();

    this.configureTelevision();
    if (this.speakerService) {
      this.configureSpeaker();
    }
    this.configureInputs();
    this.startStatusPolling();
    this.startPowerProbing();
    this.scheduleStalePowerProbe();
  }

  private configureTelevision(): void {
    this.tvService
      .setCharacteristic(this.platform.Characteristic.Name, this.device.name)
      .setCharacteristic(this.platform.Characteristic.ConfiguredName, this.device.name)
      .setCharacteristic(this.platform.Characteristic.SleepDiscoveryMode, this.platform.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

    this.tvService.getCharacteristic(this.platform.Characteristic.Active)
      .onGet(() => this.active ? this.platform.Characteristic.Active.ACTIVE : this.platform.Characteristic.Active.INACTIVE)
      .onSet(async value => this.setActive(value));

    this.tvService.getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
      .onGet(() => this.currentInput)
      .onSet(async value => this.setInput(Number(value)));

    this.tvService.getCharacteristic(this.platform.Characteristic.RemoteKey)
      .onSet(async value => this.handleRemoteKey(Number(value)));
  }

  private configureSpeaker(): void {
    if (!this.speakerService) {
      return;
    }
    this.speakerService
      .setCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.ACTIVE)
      .setCharacteristic(this.platform.Characteristic.VolumeControlType, this.platform.Characteristic.VolumeControlType.RELATIVE);

    this.speakerService.getCharacteristic(this.platform.Characteristic.Mute)
      .onGet(() => this.muted)
      .onSet(async value => this.setMute(Boolean(value)));

    this.speakerService.getCharacteristic(this.platform.Characteristic.VolumeSelector)
      .onSet(async value => {
        await this.prepareOperationWake();
        if (value === this.platform.Characteristic.VolumeSelector.INCREMENT) {
          await this.volumeClient.volumeUp();
        } else {
          await this.volumeClient.volumeDown();
        }
        this.recordUserOperation();
      });

    this.tvService.addLinkedService(this.speakerService);
  }

  private configureInputs(): void {
    const inputs = this.getInputs();
    const configuredSubtypes = new Set(
      inputs.map((input, index) => `input-${input.identifier ?? index + 1}`),
    );

    for (const service of [...this.accessory.services]) {
      if (service.UUID === this.platform.Service.InputSource.UUID
        && service.subtype?.startsWith('input-')
        && !configuredSubtypes.has(service.subtype)) {
        this.tvService.removeLinkedService(service);
        this.accessory.removeService(service);
        this.platform.log.info(
          `Removed stale REGZA input from ${this.device.name}: ${service.displayName}.`,
        );
      }
    }

    for (const input of inputs) {
      const identifier = input.identifier ?? inputs.indexOf(input) + 1;
      const subtype = `input-${identifier}`;
      const inputService = this.accessory.getServiceById(this.platform.Service.InputSource, subtype)
        ?? this.accessory.addService(this.platform.Service.InputSource, input.name, subtype);

      inputService
        .setCharacteristic(this.platform.Characteristic.Name, input.name)
        .setCharacteristic(this.platform.Characteristic.Identifier, identifier)
        .setCharacteristic(this.platform.Characteristic.ConfiguredName, input.name)
        .setCharacteristic(this.platform.Characteristic.IsConfigured, this.platform.Characteristic.IsConfigured.CONFIGURED)
        .setCharacteristic(
          this.platform.Characteristic.InputSourceType,
          [RemoteKeys.TERRESTRIAL, RemoteKeys.BS, RemoteKeys.CS].some(key => matchesInputKey(input.key, key))
            ? this.platform.Characteristic.InputSourceType.TUNER
            : this.platform.Characteristic.InputSourceType.HDMI,
        );

      this.tvService.addLinkedService(inputService);
    }
  }

  private async setActive(value: CharacteristicValue): Promise<void> {
    const shouldBeActive = value === this.platform.Characteristic.Active.ACTIVE;

    if (shouldSkipPowerRequest(this.device.deviceType, shouldBeActive, this.active)) {
      return;
    }

    if (this.device.deviceType === 'recorder') {
      await this.setRecorderActive(shouldBeActive);
      return;
    }

    if (shouldBeActive && this.device.enableWakeOnLan === true && this.device.mac) {
      this.platform.log.info(`Sending Wake on LAN packet to ${this.device.name}.`);
      await this.wake(this.device.mac);
      await this.sleep((this.device.powerOnDelaySeconds ?? 2) * 1000);
    }

    this.platform.log.info(`Sending REGZA power ${shouldBeActive ? 'ON' : 'OFF'} to ${this.device.name}.`);
    if (shouldBeActive) {
      await this.client.powerOn();
    } else {
      await this.client.powerOff();
      this.endNavigationMode();
    }
    this.updatePowerState(shouldBeActive, true);
    this.recordUserOperation();

  }

  private setRecorderActive(shouldBeActive: boolean): Promise<void> {
    const generation = ++this.recorderPowerGeneration;
    const operation = this.recorderPowerOperation
      .catch(() => undefined)
      .then(() => this.runRecorderPowerOperation(shouldBeActive, generation));
    this.recorderPowerOperation = operation;
    return operation;
  }

  private async runRecorderPowerOperation(shouldBeActive: boolean, generation: number): Promise<void> {
    const linkedTvActive = this.linkedTvIp
      ? this.platform.getDevicePowerState(this.linkedTvIp)
      : undefined;
    // Sending Start Menu while the linked TV is ON can switch HDMI input and
    // interrupt viewing. Only use the wake-then-toggle OFF normalization when
    // the linked TV is confirmed OFF, or when no TV is linked.
    const normalizeOff = this.linkedTvIp === undefined || linkedTvActive === false;
    const steps = getRecorderPowerSteps(
      shouldBeActive,
      this.device.recorderPowerOnLinkedTv !== false,
      this.linkedTvClient !== undefined,
      normalizeOff,
    );
    const offDelayMs = (this.device.recorderPowerOffDelaySeconds ?? 10) * 1000;

    this.platform.log.info(
      `Setting recorder power ${shouldBeActive ? 'ON' : 'OFF'} for ${this.device.name} ` +
      `(linkedTv=${this.linkedTvIp ?? 'none'}, linkedTvState=${linkedTvActive === undefined ? 'unknown' : linkedTvActive ? 'ON' : 'OFF'}, ` +
      `offNormalization=${!shouldBeActive && normalizeOff ? 'enabled' : 'not used'}).`,
    );
    for (const step of steps) {
      if (generation !== this.recorderPowerGeneration) {
        this.platform.log.debug(`Cancelled superseded recorder power operation for ${this.device.name}.`);
        return;
      }
      switch (step) {
        case 'linkedTvOn':
          await this.linkedTvClient?.powerOn();
          if (this.linkedTvIp) {
            this.platform.updateDevicePowerState(this.linkedTvIp, true);
          }
          break;
        case 'recorderMenu':
          await this.client.sendKey('menu');
          break;
        case 'delay':
          await this.sleep(offDelayMs);
          break;
        case 'recorderToggle':
          if (!shouldBeActive && normalizeOff && !shouldContinueRecorderOffNormalization(
            this.linkedTvIp,
            this.linkedTvIp ? this.platform.getDevicePowerState(this.linkedTvIp) : undefined,
          )) {
            this.platform.log.info(
              `Cancelled recorder OFF normalization for ${this.device.name} because linked TV ` +
              `${this.linkedTvIp} is no longer confirmed OFF.`,
            );
            return;
          }
          await this.client.powerToggle();
          break;
      }
    }

    if (!shouldBeActive) {
      this.endNavigationMode();
    }
    this.updatePowerState(shouldBeActive, true);
    this.recordUserOperation();
  }

  private async setInput(identifier: number): Promise<void> {
    const input = this.getInputs().find(item => (item.identifier ?? this.getInputs().indexOf(item) + 1) === identifier);
    if (input) {
      const isBroadcastInput = [RemoteKeys.TERRESTRIAL, RemoteKeys.BS, RemoteKeys.CS]
        .some(key => matchesInputKey(input.key, key));
      if (isBroadcastInput) {
        await this.prepareOperationWake();
      }
      this.platform.log.info(`Switching ${this.device.name} to input ${input.name} using key=${input.key}.`);
      await this.client.sendKey(input.key);
      this.currentInput = identifier;
      this.accessory.context.currentInput = identifier;
      this.tvService.updateCharacteristic(this.platform.Characteristic.ActiveIdentifier, identifier);
      this.recordUserOperation();
      if (isBroadcastInput) {
        await this.sleep(750);
        await this.pollStatus();
      }
    }
  }

  private async handleRemoteKey(value: number): Promise<void> {
    const previousOperationAt = this.lastUserOperationAt;
    if (this.platform.config.debug) {
      this.platform.log.info(
        `[${this.device.name}] HomeKit remote key=${value}, deviceType=${this.device.deviceType ?? 'tv'}, ` +
        `selectKeyMode=${this.device.selectKeyMode ?? 'guideFirst'}, navigation=${this.navigationModeActive}, ` +
        `layer=${this.navigationLayer}.`,
      );
    }
    switch (value) {
      case this.platform.Characteristic.RemoteKey.REWIND:
        await this.client.sendKey('rewind');
        break;
      case this.platform.Characteristic.RemoteKey.FAST_FORWARD:
        await this.client.sendKey('fastForward');
        break;
      case this.platform.Characteristic.RemoteKey.ARROW_UP:
        if (this.navigationModeActive || this.device.contextualRemoteArrows === false) {
          await this.client.sendKey('up');
          this.refreshNavigationTimeout();
        } else {
          await this.prepareOperationWake(previousOperationAt);
          await this.client.channelUp();
        }
        break;
      case this.platform.Characteristic.RemoteKey.ARROW_DOWN:
        if (this.navigationModeActive || this.device.contextualRemoteArrows === false) {
          await this.client.sendKey('down');
          this.refreshNavigationTimeout();
        } else {
          await this.prepareOperationWake(previousOperationAt);
          await this.client.channelDown();
        }
        break;
      case this.platform.Characteristic.RemoteKey.ARROW_LEFT:
        if (this.navigationModeActive || this.device.contextualRemoteArrows === false) {
          await this.client.sendKey('left');
          this.refreshNavigationTimeout();
        } else {
          await this.cycleBroadcastBand(-1);
        }
        break;
      case this.platform.Characteristic.RemoteKey.ARROW_RIGHT:
        if (this.navigationModeActive || this.device.contextualRemoteArrows === false) {
          await this.client.sendKey('right');
          this.refreshNavigationTimeout();
        } else {
          await this.cycleBroadcastBand(1);
        }
        break;
      case this.platform.Characteristic.RemoteKey.SELECT:
        await this.handleSelectKey();
        break;
      case this.platform.Characteristic.RemoteKey.BACK:
        await this.client.sendKey('return');
        if (this.navigationLayer === 'dateSelection') {
          this.navigationLayer = getNavigationLayerAfterDateSelection(this.navigationLayer);
          this.navigationSelectionMade = false;
          this.refreshNavigationTimeout();
          this.logNavigationTransition('back from date selection');
        } else {
          this.endNavigationMode();
        }
        break;
      case this.platform.Characteristic.RemoteKey.EXIT:
        await this.client.sendKey('exit');
        this.endNavigationMode();
        break;
      case this.platform.Characteristic.RemoteKey.INFORMATION:
        await this.client.sendKey('display');
        break;
      case this.platform.Characteristic.RemoteKey.NEXT_TRACK:
        if (this.device.deviceType === 'recorder') {
          await this.client.sendKey('next');
        } else {
          await this.prepareOperationWake(previousOperationAt);
          await this.client.channelUp();
        }
        break;
      case this.platform.Characteristic.RemoteKey.PREVIOUS_TRACK:
        if (this.device.deviceType === 'recorder') {
          await this.client.sendKey('previous');
        } else {
          await this.prepareOperationWake(previousOperationAt);
          await this.client.channelDown();
        }
        break;
      case this.platform.Characteristic.RemoteKey.PLAY_PAUSE:
        {
          const playPauseKey = getPlayPauseKey(this.playbackPaused);
          await this.client.sendKey(playPauseKey);
          this.playbackPaused = !this.playbackPaused;
        }
        break;
      default:
        this.platform.log.debug(`Unsupported HomeKit remote key: ${value}`);
        break;
    }
    this.recordUserOperation();
  }

  private async handleSelectKey(): Promise<void> {
    const mode = this.device.selectKeyMode ?? 'guideFirst';
    if (mode === 'normal' || this.navigationModeActive) {
      await this.client.sendKey('enter');
      if (this.navigationModeActive) {
        if (this.navigationLayer === 'dateSelection') {
          this.navigationLayer = getNavigationLayerAfterDateSelection(this.navigationLayer);
          this.navigationSelectionMade = false;
          this.refreshNavigationTimeout();
          this.logNavigationTransition('select from date selection');
        } else {
          this.navigationSelectionMade = true;
          this.scheduleNavigationReset(
            this.device.navigationPostSelectResetSeconds ?? 15,
            shouldAutoCloseNavigationMenu(this.device.deviceType),
          );
        }
      }
      return;
    }

    const openingKey = mode === 'menuFirst'
      ? 'menu'
      : mode === 'quickFirst'
        ? 'quick'
        : mode === 'timeshiftFirst'
          ? 'timeshift'
          : 'guide';
    await this.client.sendKey(openingKey);
    this.navigationModeActive = true;
    this.navigationLayer = 'menu';
    this.navigationSelectionMade = false;
    this.refreshNavigationTimeout();
    this.logNavigationTransition(`opened with ${openingKey}`);
  }

  private async cycleBroadcastBand(direction: -1 | 1): Promise<void> {
    await this.prepareOperationWake();
    const inputs = this.getInputs();
    const broadcastInputs = [RemoteKeys.TERRESTRIAL, RemoteKeys.BS, RemoteKeys.CS]
      .map(key => inputs.find(input => matchesInputKey(input.key, key)))
      .filter((input): input is RegzaInputConfig => input !== undefined);
    if (broadcastInputs.length === 0) {
      return;
    }
    const broadcastIdentifiers = broadcastInputs.map(input => input.identifier ?? inputs.indexOf(input) + 1);
    const currentIndex = broadcastIdentifiers.indexOf(this.currentInput);
    const targetIndex = currentIndex === -1
      ? 0
      : (currentIndex + direction + broadcastInputs.length) % broadcastInputs.length;
    const targetInput = broadcastInputs[targetIndex];
    const targetIdentifier = targetInput.identifier ?? inputs.indexOf(targetInput) + 1;
    await this.client.sendKey(targetInput.key);
    this.currentInput = targetIdentifier;
    this.accessory.context.currentInput = targetIdentifier;
    this.tvService.updateCharacteristic(
      this.platform.Characteristic.ActiveIdentifier,
      targetIdentifier,
    );
    await this.sleep(750);
    await this.pollStatus();
  }

  private refreshNavigationTimeout(): void {
    if (!this.navigationModeActive) {
      return;
    }

    if (this.navigationSelectionMade) {
      this.scheduleNavigationReset(
        this.device.navigationPostSelectResetSeconds ?? 15,
        shouldAutoCloseNavigationMenu(this.device.deviceType),
      );
    } else {
      this.scheduleNavigationReset(
        this.device.navigationTimeoutSeconds ?? 60,
        shouldAutoCloseNavigationMenu(this.device.deviceType),
      );
    }
  }

  private scheduleNavigationReset(timeoutSeconds: number, closeMenu = false): void {
    if (this.navigationTimer) {
      clearTimeout(this.navigationTimer);
    }
    this.navigationTimer = setTimeout(() => {
      if (closeMenu) {
        void this.closeNavigationMenu();
      } else {
        this.endNavigationMode();
      }
    }, timeoutSeconds * 1000);
    this.navigationTimer.unref();
  }

  private async closeNavigationMenu(): Promise<void> {
    try {
      if (this.navigationLayer === 'dateSelection') {
        await this.client.sendKey('return');
        await this.sleep(200);
      }
      await this.client.sendKey('return');
      this.platform.log.debug(`Navigation menu auto-closed for ${this.device.name}.`);
    } catch (error) {
      this.platform.log.warn(
        `Unable to auto-close navigation menu for ${this.device.name}: ` +
        `${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.endNavigationMode();
    }
  }

  private endNavigationMode(): void {
    if (this.navigationTimer) {
      clearTimeout(this.navigationTimer);
      this.navigationTimer = undefined;
    }
    this.navigationModeActive = false;
    this.navigationLayer = 'viewing';
    this.navigationSelectionMade = false;
  }

  private logNavigationTransition(reason: string): void {
    this.platform.log.debug(
      `Navigation state for ${this.device.name}: layer=${this.navigationLayer}, ` +
      `active=${this.navigationModeActive}, reason=${reason}.`,
    );
  }

  private getInputs(): RegzaInputConfig[] {
    return this.device.inputs?.length ? this.device.inputs : DEFAULT_INPUTS;
  }

  private startStatusPolling(): void {
    if (this.device.supportsV2Status === false) {
      return;
    }
    const intervalSeconds = Math.max(120, this.device.pollingInterval ?? 120);
    if (intervalSeconds <= 0) {
      return;
    }
    this.scheduleStatusPoll(1000, intervalSeconds);
  }

  private scheduleStatusPoll(delayMs: number, intervalSeconds: number): void {
    if (this.statusPollTimer) {
      clearTimeout(this.statusPollTimer);
    }
    this.statusPollTimer = setTimeout(() => void this.runScheduledStatusPoll(intervalSeconds), delayMs);
    this.statusPollTimer.unref();
  }

  private async runScheduledStatusPoll(intervalSeconds: number): Promise<void> {
    this.statusPollTimer = undefined;
    try {
      await this.pollStatus();
    } finally {
      this.scheduleStatusPoll(
        getStatusPollDelayMs(intervalSeconds, this.statusPollFailureCount),
        intervalSeconds,
      );
    }
  }

  private startPowerProbing(): void {
    if (this.device.supportsV2Status === false) {
      return;
    }
    const mode = this.device.powerProbeMode
      ?? (this.device.enableMutePowerProbe === false ? 'optimistic' : 'operation');
    if (mode === 'optimistic') {
      return;
    }

    if (mode === 'interval') {
      setTimeout(() => void this.probePowerStatus(true), 2000).unref();
      const intervalSeconds = this.device.powerProbeInterval ?? 60;
      const timer = setInterval(() => void this.probePowerStatus(false), intervalSeconds * 1000);
      timer.unref();
    }
  }

  private async probePowerStatus(force: boolean): Promise<boolean> {
    if (this.powerProbeRunning) {
      return false;
    }

    const intervalMs = (this.device.powerProbeInterval ?? 60) * 1000;
    if (!force && Date.now() - this.powerStateConfirmedAt < intervalMs) {
      return false;
    }

    // Avoid showing the mute overlay while the user is navigating a TV menu.
    if (this.navigationModeActive) {
      return false;
    }

    this.powerProbeRunning = true;
    try {
      if (this.device.supportsSsdpRendererStatus === true) {
        const detectedActive = await probeMediaRenderer(this.device.ip);
        if (detectedActive) {
          this.ssdpRendererMissCount = 0;
          const changed = !this.active;
          this.updatePowerState(true, true);
          if (changed) {
            this.platform.log.info(`REGZA SSDP power probe: ${this.device.name} is ON.`);
          }
          this.powerProbeFailureCount = 0;
          this.powerProbeConnectivityFailureCount = 0;
          return true;
        }

        this.ssdpRendererMissCount += 1;
        if (shouldConfirmOffAfterSsdpMisses(this.ssdpRendererMissCount)) {
          const changed = this.active;
          this.updatePowerState(false, true);
          if (changed) {
            this.platform.log.info(
              `REGZA SSDP power probe: ${this.device.name} is OFF after ` +
              `${this.ssdpRendererMissCount} consecutive MediaRenderer misses.`,
            );
          }
          return true;
        }
        return false;
      }

      const playback = await this.client.getPlaybackStatus();
      const detectedActive = isPlaybackDefinitelyActive(playback.status, playback.content_type)
        ? true
        : await this.withMuteOperationLock(
          () => this.client.probePowerWithMute(this.device.operationCommandDelayMs ?? 250),
        );

      const changed = detectedActive !== this.active;
      this.updatePowerState(detectedActive, true);
      if (changed) {
        this.platform.log.info(
          `REGZA power probe: ${this.device.name} is ${detectedActive ? 'ON' : 'OFF'}.`,
        );
      }
      if (this.powerProbeFailureCount > 0 && this.platform.config.debug === true) {
        this.platform.log.debug(
          `REGZA power probing recovered for ${this.device.name} after ` +
          `${this.powerProbeFailureCount} failed attempt${this.powerProbeFailureCount === 1 ? '' : 's'}.`,
        );
      }
      this.powerProbeFailureCount = 0;
      this.powerProbeConnectivityFailureCount = 0;
      return true;
    } catch (error) {
      this.powerProbeFailureCount += 1;
      const connectivityFailure = isConnectivityFailure(error);
      this.powerProbeConnectivityFailureCount = connectivityFailure
        ? this.powerProbeConnectivityFailureCount + 1
        : 0;
      if (shouldConfirmOffAfterConnectivityFailures(this.powerProbeConnectivityFailureCount)) {
        const changed = this.active;
        this.updatePowerState(false, true);
        if (changed) {
          this.platform.log.info(
            `REGZA power probe: ${this.device.name} is OFF after ` +
            `${this.powerProbeConnectivityFailureCount} consecutive connection failures.`,
          );
        }
        return true;
      }
      if (this.powerProbeFailureCount === 1) {
        const message = `Unable to probe REGZA power state for ${this.device.name}: ` +
          `${error instanceof Error ? error.message : String(error)}. ` +
          'Further consecutive failures will be suppressed.';
        if (connectivityFailure || this.platform.config.debug === true) {
          this.platform.log.debug(message);
        } else {
          this.platform.log.warn(message);
        }
      }
      return false;
    } finally {
      this.powerProbeRunning = false;
    }
  }

  private pollStatus(): Promise<boolean> {
    if (this.statusPollRunning) {
      return this.statusPollRunning;
    }
    const operation = this.pollStatusOnce();
    this.statusPollRunning = operation;
    void operation.finally(() => {
      if (this.statusPollRunning === operation) {
        this.statusPollRunning = undefined;
      }
    });
    return operation;
  }

  private async pollStatusOnce(): Promise<boolean> {
    try {
      if (this.device.supportsSsdpRendererStatus === true) {
        const rendererActive = await probeMediaRenderer(this.device.ip);
        if (!rendererActive) {
          this.ssdpRendererMissCount += 1;
          if (shouldConfirmOffAfterSsdpMisses(this.ssdpRendererMissCount)) {
            const changed = this.active;
            this.updatePowerState(false, true);
            if (changed) {
              this.platform.log.info(
                `REGZA SSDP status: ${this.device.name} is OFF after ` +
                `${this.ssdpRendererMissCount} consecutive MediaRenderer misses.`,
              );
            }
          }
          this.statusPollFailureCount = 0;
          return true;
        }

        this.ssdpRendererMissCount = 0;
        this.updatePowerState(true, true);
      }

      const playback = await this.client.getPlaybackStatus();
      if (playback.status === 0) {
        if (playback.content_type === 'external') {
          const inputIdentifier = findInputIdentifier(this.getInputs(), RemoteKeys.HDMI_NEXT_ACTIVE);
          if (inputIdentifier !== undefined && this.currentInput !== inputIdentifier) {
            this.currentInput = inputIdentifier;
            this.accessory.context.currentInput = inputIdentifier;
            this.tvService.updateCharacteristic(this.platform.Characteristic.ActiveIdentifier, inputIdentifier);
          }
        } else if (playback.content_type === 'broadcast') {
          this.updatePowerState(true, true);
          const channel = playback.epg_info_current?.channel ?? '';
          const inputIdentifier = findInputIdentifier(this.getInputs(), getBroadcastInputKey(channel));
          if (inputIdentifier !== undefined && inputIdentifier !== this.currentInput) {
            this.currentInput = inputIdentifier;
            this.accessory.context.currentInput = inputIdentifier;
            this.tvService.updateCharacteristic(this.platform.Characteristic.ActiveIdentifier, inputIdentifier);
          }
        }
      }
      if (this.statusPollFailureCount > 0) {
        if (this.platform.config.debug === true) {
          this.platform.log.debug(
            `REGZA v2 status polling recovered for ${this.device.name} after ` +
            `${this.statusPollFailureCount} failed attempt${this.statusPollFailureCount === 1 ? '' : 's'}.`,
          );
        }
        this.statusPollFailureCount = 0;
      }
      return true;
    } catch (error) {
      this.statusPollFailureCount += 1;
      if (this.platform.config.debug === true && this.statusPollFailureCount === 1) {
        this.platform.log.debug(
          `Unable to poll REGZA v2 status for ${this.device.name}: ` +
          `${error instanceof Error ? error.message : String(error)}. ` +
          'Further consecutive failures will be suppressed and retried with backoff until polling recovers.',
        );
      }
      return false;
    }
  }

  private async setMute(targetMuted: boolean): Promise<void> {
    await this.prepareOperationWake();
    await this.withMuteOperationLock(() => this.setMuteUnlocked(targetMuted));
  }

  private async setMuteUnlocked(targetMuted: boolean): Promise<void> {
    if (!this.speakerService) {
      return;
    }
    const before = await this.volumeClient.getMuteStatus();
    if (before.status !== 0) {
      await this.volumeClient.mute();
      this.recordUserOperation();
      return;
    }

    const beforeMuted = before.mute === 'on';
    if (beforeMuted === targetMuted) {
      this.muted = targetMuted;
      this.accessory.context.muted = targetMuted;
      this.speakerService.updateCharacteristic(this.platform.Characteristic.Mute, targetMuted);
      this.recordUserOperation();
      return;
    }

    await this.volumeClient.mute();
    this.recordUserOperation();
    await this.sleep(500);
    const after = await this.volumeClient.getMuteStatus();
    if (after.status === 0 && (after.mute === 'on') === targetMuted) {
      this.muted = targetMuted;
      this.accessory.context.muted = targetMuted;
      this.speakerService.updateCharacteristic(this.platform.Characteristic.Mute, targetMuted);
      this.updatePowerState(true, true);
    }
  }

  private wake(mac: string): Promise<void> {
    return new Promise((resolve, reject) => {
      wol.wake(mac, { address: this.device.wakeOnLanAddress ?? '255.255.255.255', port: this.device.wakeOnLanPort ?? 2304 }, error => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private updatePowerState(active: boolean, confirmed: boolean): void {
    this.active = active;
    if (active) {
      this.ssdpRendererMissCount = 0;
    }
    this.accessory.context.active = active;
    this.platform.updateDevicePowerState(this.device.ip, active);
    if (confirmed) {
      this.powerStateConfirmedAt = Date.now();
    }
    this.tvService.updateCharacteristic(
      this.platform.Characteristic.Active,
      active
        ? this.platform.Characteristic.Active.ACTIVE
        : this.platform.Characteristic.Active.INACTIVE,
    );
  }

  private async prepareOperationWake(previousOperationAt = this.lastUserOperationAt): Promise<void> {
    const now = Date.now();
    const wakeThresholdMs = (this.device.operationPowerOnThresholdSeconds ?? 30) * 1000;

    if (!shouldPrepareOperationWake(this.device.powerMode, now - previousOperationAt, wakeThresholdMs)) {
      return;
    }
    if (this.operationWakeRunning) {
      await this.operationWakeRunning;
      return;
    }

    const operation = (async () => {
      await this.client.powerOn();
      this.updatePowerState(true, true);
      await this.sleep(this.device.operationCommandDelayMs ?? 250);
    })();
    this.operationWakeRunning = operation;
    try {
      await operation;
    } finally {
      if (this.operationWakeRunning === operation) {
        this.operationWakeRunning = undefined;
      }
    }
  }

  private recordUserOperation(): void {
    this.lastUserOperationAt = Date.now();
    this.accessory.context.lastUserOperationAt = this.lastUserOperationAt;
    this.scheduleStalePowerProbe();
  }

  private scheduleStalePowerProbe(): void {
    if (this.stalePowerProbeTimer) {
      clearTimeout(this.stalePowerProbeTimer);
      this.stalePowerProbeTimer = undefined;
    }

    if (this.device.supportsV2Status === false) {
      return;
    }

    const mode = this.device.powerProbeMode
      ?? (this.device.enableMutePowerProbe === false ? 'optimistic' : 'operation');
    if (mode !== 'operation') {
      return;
    }

    const intervalMs = (this.device.stalePowerProbeHours ?? 8) * 60 * 60 * 1000;
    const delayMs = Math.max(1000, intervalMs - (Date.now() - this.lastUserOperationAt));
    this.stalePowerProbeTimer = setTimeout(() => void this.runStalePowerProbe(), delayMs);
    this.stalePowerProbeTimer.unref();
  }

  private async runStalePowerProbe(): Promise<void> {
    if (this.navigationModeActive || this.powerProbeRunning) {
      this.stalePowerProbeTimer = setTimeout(() => void this.runStalePowerProbe(), 60_000);
      this.stalePowerProbeTimer.unref();
      return;
    }

    const completed = await this.probePowerStatus(true);
    const shouldRetryConnectivity = this.powerProbeConnectivityFailureCount > 0
      && this.powerProbeConnectivityFailureCount < 3;
    const shouldRetryOtherFailure = this.powerProbeConnectivityFailureCount === 0
      && this.powerProbeFailureCount > 0
      && this.powerProbeFailureCount < 3;
    if (!completed && (shouldRetryConnectivity || shouldRetryOtherFailure)) {
      this.stalePowerProbeTimer = setTimeout(() => void this.runStalePowerProbe(), 60_000);
      this.stalePowerProbeTimer.unref();
    }
  }

  private async withMuteOperationLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.muteOperationQueue;
    let release: () => void = () => undefined;
    this.muteOperationQueue = new Promise<void>(resolve => {
      release = resolve;
    });

    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
