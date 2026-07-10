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
  private currentInput = 1;

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

    this.configureTelevision();
    this.configureSpeaker();
    this.configureInputs();
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
    }
    this.active = shouldBeActive;
    this.tvService.updateCharacteristic(this.platform.Characteristic.Active, shouldBeActive
      ? this.platform.Characteristic.Active.ACTIVE
      : this.platform.Characteristic.Active.INACTIVE);

  }

  private async setInput(identifier: number): Promise<void> {
    this.currentInput = identifier;
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
        break;
      case this.platform.Characteristic.RemoteKey.ARROW_DOWN:
        await this.client.sendKey('down');
        break;
      case this.platform.Characteristic.RemoteKey.ARROW_LEFT:
        await this.client.sendKey('left');
        break;
      case this.platform.Characteristic.RemoteKey.ARROW_RIGHT:
        await this.client.sendKey('right');
        break;
      case this.platform.Characteristic.RemoteKey.SELECT:
        await this.client.sendKey('enter');
        break;
      case this.platform.Characteristic.RemoteKey.BACK:
        await this.client.sendKey('return');
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

  private getInputs(): RegzaInputConfig[] {
    return this.device.inputs?.length ? this.device.inputs : DEFAULT_INPUTS;
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
