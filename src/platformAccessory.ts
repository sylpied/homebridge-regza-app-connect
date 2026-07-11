import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import wol from 'wake_on_lan';
import { DEFAULT_INPUTS, RegzaDeviceConfig, RegzaInputConfig } from './settings';
import { RegzaClient } from './regzaClient';
import type { RegzaPlatform } from './platform';

export class RegzaTvAccessory {
  private readonly client: RegzaClient;
  private readonly tvService: Service;
  private readonly speakerService: Service;
  private active = false;
  private muted = false;
  private currentInput = 1;
  private powerProbeRunning = false;
  private navigationModeActive = false;
  private navigationTimer?: NodeJS.Timeout;

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

    this.configureTelevision();
    this.configureSpeaker();
    this.configureInputs();
    this.startStatusPolling();
    this.startPowerProbing();
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
      .onSet(async () => this.client.mute());

    this.speakerService.getCharacteristic(this.platform.Characteristic.VolumeSelector)
      .onSet(async value => {
        if (value === this.platform.Characteristic.VolumeSelector.INCREMENT) {
          await this.client.volumeUp();
        } else {
          await this.client.volumeDown();
        }
      });

    this.tvService.addLinkedService(this.speakerService);
  }

  private configureInputs(): void {
    const inputs = this.getInputs();

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
    this.active = shouldBeActive;
    this.accessory.context.active = shouldBeActive;
    this.tvService.updateCharacteristic(this.platform.Characteristic.Active, shouldBeActive
      ? this.platform.Characteristic.Active.ACTIVE
      : this.platform.Characteristic.Active.INACTIVE);

  }

  private async setInput(identifier: number): Promise<void> {
    this.currentInput = identifier;
    this.accessory.context.currentInput = identifier;
    const input = this.getInputs().find(item => (item.identifier ?? this.getInputs().indexOf(item) + 1) === identifier);
    if (input) {
      this.platform.log.info(`Switching ${this.device.name} to input ${input.name} using key=${input.key}.`);
      await this.client.sendKey(input.key);
    }
  }

  private async handleRemoteKey(value: number): Promise<void> {
    switch (value) {
      case this.platform.Characteristic.RemoteKey.ARROW_UP:
        await this.client.sendKey('up');
        this.refreshNavigationTimeout();
        break;
      case this.platform.Characteristic.RemoteKey.ARROW_DOWN:
        await this.client.sendKey('down');
        this.refreshNavigationTimeout();
        break;
      case this.platform.Characteristic.RemoteKey.ARROW_LEFT:
        await this.client.sendKey('left');
        this.refreshNavigationTimeout();
        break;
      case this.platform.Characteristic.RemoteKey.ARROW_RIGHT:
        await this.client.sendKey('right');
        this.refreshNavigationTimeout();
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
        await this.client.channelUp();
        break;
      case this.platform.Characteristic.RemoteKey.PREVIOUS_TRACK:
        await this.client.channelDown();
        break;
      default:
        this.platform.log.debug(`Unsupported HomeKit remote key: ${value}`);
        break;
    }
  }

  private async handleSelectKey(): Promise<void> {
    const mode = this.device.selectKeyMode ?? 'guideFirst';
    if (mode === 'normal' || this.navigationModeActive) {
      await this.client.sendKey('enter');
      this.refreshNavigationTimeout();
      return;
    }

    const openingKey = mode === 'menuFirst'
      ? 'menu'
      : mode === 'quickFirst'
        ? 'quick'
        : 'guide';
    await this.client.sendKey(openingKey);
    this.navigationModeActive = true;
    this.refreshNavigationTimeout();
    this.platform.log.debug(
      `Navigation mode started for ${this.device.name} using ${openingKey}.`,
    );
  }

  private refreshNavigationTimeout(): void {
    if (!this.navigationModeActive) {
      return;
    }

    if (this.navigationTimer) {
      clearTimeout(this.navigationTimer);
    }
    const timeoutSeconds = this.device.navigationTimeoutSeconds ?? 60;
    this.navigationTimer = setTimeout(() => this.endNavigationMode(), timeoutSeconds * 1000);
    this.navigationTimer.unref();
  }

  private endNavigationMode(): void {
    if (this.navigationTimer) {
      clearTimeout(this.navigationTimer);
      this.navigationTimer = undefined;
    }
    this.navigationModeActive = false;
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
    if (this.device.enableMutePowerProbe !== true) {
      return;
    }

    const intervalSeconds = this.device.powerProbeInterval ?? 300;
    const timer = setInterval(() => void this.probePowerStatus(), intervalSeconds * 1000);
    timer.unref();
    setTimeout(() => void this.probePowerStatus(), 2000).unref();
  }

  private async probePowerStatus(): Promise<void> {
    if (this.powerProbeRunning) {
      return;
    }

    this.powerProbeRunning = true;
    try {
      const playback = await this.client.getPlaybackStatus();
      const detectedActive = playback.status === 0 && playback.content_type === 'broadcast'
        ? true
        : await this.client.probePowerWithMute();

      if (detectedActive !== this.active) {
        this.active = detectedActive;
        this.accessory.context.active = detectedActive;
        this.tvService.updateCharacteristic(
          this.platform.Characteristic.Active,
          detectedActive
            ? this.platform.Characteristic.Active.ACTIVE
            : this.platform.Characteristic.Active.INACTIVE,
        );
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
    try {
      const [playback, mute] = await Promise.all([
        this.client.getPlaybackStatus(),
        this.client.getMuteStatus(),
      ]);

      if (playback.status === 0) {
        if (playback.content_type === 'external' && this.currentInput !== 4) {
          this.currentInput = 4;
          this.accessory.context.currentInput = 4;
          this.tvService.updateCharacteristic(this.platform.Characteristic.ActiveIdentifier, 4);
        } else if (playback.content_type === 'broadcast') {
          const channel = playback.epg_info_current?.channel ?? '';
          const inputIdentifier = channel.startsWith('JP-G0004')
            ? 2
            : channel.startsWith('JP-G0006') || channel.startsWith('JP-G0007')
              ? 3
              : 1;
          if (inputIdentifier !== this.currentInput) {
            this.currentInput = inputIdentifier;
            this.accessory.context.currentInput = inputIdentifier;
            this.tvService.updateCharacteristic(this.platform.Characteristic.ActiveIdentifier, inputIdentifier);
          }
        }
      }

      if (mute.status === 0) {
        const detectedMuted = mute.mute === 'on';
        if (detectedMuted !== this.muted) {
          this.muted = detectedMuted;
          this.accessory.context.muted = detectedMuted;
          this.speakerService.updateCharacteristic(this.platform.Characteristic.Mute, detectedMuted);
        }
      }
    } catch (error) {
      this.platform.log.debug(
        `Unable to poll REGZA v2 status for ${this.device.name}: ` +
        `${error instanceof Error ? error.message : String(error)}`,
      );
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

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
