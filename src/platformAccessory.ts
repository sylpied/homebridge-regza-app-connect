import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import wol from 'wake_on_lan';
import { DEFAULT_INPUTS, RegzaDeviceConfig, RegzaInputConfig } from './settings';
import { RegzaClient } from './regzaClient';
import { RemoteKeys } from './remoteKeys';
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
  return status === 0 && (contentType === 'broadcast' || contentType === 'external');
}

export class RegzaTvAccessory {
  private readonly client: RegzaClient;
  private readonly tvService: Service;
  private readonly speakerService: Service;
  private active = false;
  private muted = false;
  private currentInput = 1;
  private powerProbeRunning = false;
  private powerStateConfirmedAt = 0;
  private lastUserOperationAt = 0;
  private statusPollFailureCount = 0;
  private navigationModeActive = false;
  private navigationSelectionMade = false;
  private navigationTimer?: NodeJS.Timeout;
  private stalePowerProbeTimer?: NodeJS.Timeout;
  private muteOperationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly platform: RegzaPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly device: RegzaDeviceConfig,
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
    });

    this.platform.log.info(`Initializing REGZA accessory: ${device.name} (ip=${device.ip}, mac=${device.mac ? 'configured' : 'not configured'}, username=${device.username ? 'configured' : 'missing'}, password=${device.password ? 'configured' : 'missing'})`);

    this.accessory.getService(this.platform.Service.AccessoryInformation)
      ?.setCharacteristic(this.platform.Characteristic.Manufacturer, 'TVS REGZA / Toshiba')
      .setCharacteristic(this.platform.Characteristic.Model, 'REGZA App Connect')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, device.mac ?? device.ip);

    this.tvService = this.accessory.getService(this.platform.Service.Television)
      ?? this.accessory.addService(this.platform.Service.Television, device.name, 'television');

    this.speakerService = this.accessory.getService(this.platform.Service.TelevisionSpeaker)
      ?? this.accessory.addService(this.platform.Service.TelevisionSpeaker, `${device.name} Speaker`, 'speaker');

    this.active = accessory.context.active === true;
    this.muted = accessory.context.muted === true;
    this.currentInput = typeof accessory.context.currentInput === 'number' ? accessory.context.currentInput : 1;
    this.lastUserOperationAt = typeof accessory.context.lastUserOperationAt === 'number'
      ? accessory.context.lastUserOperationAt
      : Date.now();

    this.configureTelevision();
    this.configureSpeaker();
    this.configureInputs();
    this.startStatusPolling();
    this.startPowerProbing();
    this.scheduleStalePowerProbe();
  }

  private configureTelevision(): void {
    this.tvService
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
          await this.client.volumeUp();
        } else {
          await this.client.volumeDown();
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
        .setCharacteristic(this.platform.Characteristic.Identifier, identifier)
        .setCharacteristic(this.platform.Characteristic.ConfiguredName, input.name)
        .setCharacteristic(this.platform.Characteristic.IsConfigured, this.platform.Characteristic.IsConfigured.CONFIGURED)
        .setCharacteristic(this.platform.Characteristic.InputSourceType, this.platform.Characteristic.InputSourceType.HDMI);

      this.tvService.addLinkedService(inputService);
    }
  }

  private async setActive(value: CharacteristicValue): Promise<void> {
    const shouldBeActive = value === this.platform.Characteristic.Active.ACTIVE;

    if (shouldBeActive === this.active) {
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
    switch (value) {
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
        this.endNavigationMode();
        break;
      case this.platform.Characteristic.RemoteKey.EXIT:
        await this.client.sendKey('exit');
        this.endNavigationMode();
        break;
      case this.platform.Characteristic.RemoteKey.INFORMATION:
        await this.client.sendKey('display');
        break;
      case this.platform.Characteristic.RemoteKey.NEXT_TRACK:
        await this.prepareOperationWake(previousOperationAt);
        await this.client.channelUp();
        break;
      case this.platform.Characteristic.RemoteKey.PREVIOUS_TRACK:
        await this.prepareOperationWake(previousOperationAt);
        await this.client.channelDown();
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
        this.navigationSelectionMade = true;
        this.scheduleNavigationReset(this.device.navigationPostSelectResetSeconds ?? 15, true);
      }
      return;
    }

    const openingKey = mode === 'menuFirst'
      ? 'menu'
      : mode === 'quickFirst'
        ? 'quick'
        : 'guide';
    await this.client.sendKey(openingKey);
    this.navigationModeActive = true;
    this.navigationSelectionMade = false;
    this.refreshNavigationTimeout();
    this.platform.log.debug(
      `Navigation mode started for ${this.device.name} using ${openingKey}.`,
    );
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
      this.scheduleNavigationReset(this.device.navigationPostSelectResetSeconds ?? 15, true);
    } else {
      this.scheduleNavigationReset(this.device.navigationTimeoutSeconds ?? 60, false);
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
    this.navigationSelectionMade = false;
  }

  private getInputs(): RegzaInputConfig[] {
    return this.device.inputs?.length ? this.device.inputs : DEFAULT_INPUTS;
  }

  private startStatusPolling(): void {
    const intervalSeconds = this.device.pollingInterval ?? 30;
    if (intervalSeconds <= 0) {
      return;
    }

    const timer = setInterval(() => void this.pollStatus(), intervalSeconds * 1000);
    timer.unref();
    setTimeout(() => void this.pollStatus(), 1000).unref();
  }

  private startPowerProbing(): void {
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

  private async probePowerStatus(force: boolean): Promise<void> {
    if (this.powerProbeRunning) {
      return;
    }

    const intervalMs = (this.device.powerProbeInterval ?? 60) * 1000;
    if (!force && Date.now() - this.powerStateConfirmedAt < intervalMs) {
      return;
    }

    // Avoid showing the mute overlay while the user is navigating a TV menu.
    if (this.navigationModeActive) {
      return;
    }

    this.powerProbeRunning = true;
    try {
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
    } catch (error) {
      this.platform.log.warn(
        `Unable to probe REGZA power state for ${this.device.name}: ` +
        `${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.powerProbeRunning = false;
    }
  }

  private async pollStatus(): Promise<void> {
    const [playbackResult, muteResult] = await Promise.allSettled([
      this.client.getPlaybackStatus(),
      this.client.getMuteStatus(),
    ]);

    if (playbackResult.status === 'fulfilled') {
      const playback = playbackResult.value;
      if (playback.status === 0) {
        if (playback.content_type === 'external') {
          this.updatePowerState(true, true);
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
    }

    if (muteResult.status === 'fulfilled') {
      const mute = muteResult.value;
      if (mute.status === 0) {
        const detectedMuted = mute.mute === 'on';
        if (detectedMuted !== this.muted) {
          this.muted = detectedMuted;
          this.accessory.context.muted = detectedMuted;
          this.speakerService.updateCharacteristic(this.platform.Characteristic.Mute, detectedMuted);
        }
      }
    }

    const failures = [playbackResult, muteResult].filter(result => result.status === 'rejected');
    if (failures.length === 0) {
      if (this.statusPollFailureCount > 0) {
        if (this.platform.config.debug === true) {
          this.platform.log.debug(
            `REGZA v2 status polling recovered for ${this.device.name} after ` +
            `${this.statusPollFailureCount} failed attempt${this.statusPollFailureCount === 1 ? '' : 's'}.`,
          );
        }
        this.statusPollFailureCount = 0;
      }
    } else {
      this.statusPollFailureCount += 1;
      if (this.platform.config.debug === true && this.statusPollFailureCount === 1) {
        const reasons = failures
          .map(result => result.status === 'rejected'
            ? result.reason instanceof Error ? result.reason.message : String(result.reason)
            : '')
          .filter(Boolean)
          .join('; ');
        this.platform.log.debug(
          `Unable to poll REGZA v2 status for ${this.device.name}: ` +
          `${reasons}. ` +
          'Further consecutive failures will be suppressed until polling recovers.',
        );
      }
    }
  }

  private async setMute(targetMuted: boolean): Promise<void> {
    await this.prepareOperationWake();
    await this.withMuteOperationLock(() => this.setMuteUnlocked(targetMuted));
  }

  private async setMuteUnlocked(targetMuted: boolean): Promise<void> {
    const before = await this.client.getMuteStatus();
    if (before.status !== 0) {
      await this.client.mute();
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

    await this.client.mute();
    this.recordUserOperation();
    await this.sleep(500);
    const after = await this.client.getMuteStatus();
    if (after.status === 0 && (after.mute === 'on') === targetMuted) {
      this.muted = targetMuted;
      this.accessory.context.muted = targetMuted;
      this.speakerService.updateCharacteristic(this.platform.Characteristic.Mute, targetMuted);
      this.updatePowerState(true, true);
    }
  }

  private wake(mac: string): Promise<void> {
    return new Promise((resolve, reject) => {
      wol.wake(mac, { address: this.device.wakeOnLanAddress ?? '192.168.100.255', port: this.device.wakeOnLanPort ?? 2304 }, error => {
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
    this.accessory.context.active = active;
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

    await this.client.powerOn();
    this.updatePowerState(true, true);
    await this.sleep(this.device.operationCommandDelayMs ?? 250);
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

    await this.probePowerStatus(true);
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
