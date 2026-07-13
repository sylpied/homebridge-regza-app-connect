import type { API, DynamicPlatformPlugin, Logging, PlatformAccessory } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME, RegzaDeviceConfig, RegzaPlatformConfig } from './settings';
import { RegzaTvAccessory } from './platformAccessory';
import { applyModelProfile, MODEL_55J10X } from './modelProfiles';
import { RemoteKeys } from './remoteKeys';

export function getDeviceIdentity(device: Pick<RegzaDeviceConfig, 'ip' | 'mac'>): string {
  return (device.mac || device.ip).trim().toLowerCase();
}

export class RegzaPlatform implements DynamicPlatformPlugin {
  public readonly Service;
  public readonly Characteristic;
  private readonly cachedAccessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logging,
    public readonly config: RegzaPlatformConfig,
    public readonly api: API,
  ) {
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    this.log.debug('Finished initializing REGZA App Connect platform.');
    this.api.on('didFinishLaunching', () => this.discoverDevices());
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info(`Loading cached REGZA accessory: ${accessory.displayName}`);
    this.cachedAccessories.push(accessory);
  }

  private discoverDevices(): void {
    const devices = this.getDevices();
    const configuredUuids = new Set<string>();

    this.log.info(`REGZA App Connect configuration: ${devices.length} device${devices.length === 1 ? '' : 's'} configured, debug=${this.config.debug ? 'enabled' : 'disabled'}.`);

    for (const device of devices) {
      if (!this.isValidDevice(device)) {
        this.log.warn(`Skipping REGZA TV because name, ip, username, or password is missing. name=${device.name ?? 'missing'}, ip=${device.ip ?? 'missing'}, username=${device.username ? 'configured' : 'missing'}, password=${device.password ? 'configured' : 'missing'}`);
        continue;
      }

      const normalizedDevice = this.normalizeDeviceConfig(device);

      this.logDeviceConfig(normalizedDevice);

      const identity = getDeviceIdentity(normalizedDevice);
      const uuid = this.api.hap.uuid.generate(`${PLUGIN_NAME}:${identity}`);
      const legacyUuid = this.api.hap.uuid.generate(
        `${PLUGIN_NAME}:${normalizedDevice.mac ?? normalizedDevice.ip}:${normalizedDevice.name}`,
      );
      const existingAccessory = this.cachedAccessories.find(accessory => {
        const cachedDevice = accessory.context.device as Partial<RegzaDeviceConfig> | undefined;
        const cachedIdentity = cachedDevice?.ip
          ? getDeviceIdentity({ ip: cachedDevice.ip, mac: cachedDevice.mac })
          : undefined;
        return accessory.UUID === uuid || accessory.UUID === legacyUuid || cachedIdentity === identity;
      });
      if (existingAccessory) {
        configuredUuids.add(existingAccessory.UUID);
        this.log.info(`Restoring REGZA TV from cache: ${normalizedDevice.name}`);
        existingAccessory.context.device = normalizedDevice;
        new RegzaTvAccessory(this, existingAccessory, normalizedDevice);
        continue;
      }

      configuredUuids.add(uuid);
      this.log.info(`Adding new REGZA TV: ${normalizedDevice.name}`);
      const accessory = new this.api.platformAccessory(normalizedDevice.name, uuid);
      accessory.context.device = normalizedDevice;
      new RegzaTvAccessory(this, accessory, normalizedDevice);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }

    const staleAccessories = this.cachedAccessories.filter(accessory => !configuredUuids.has(accessory.UUID));
    if (staleAccessories.length > 0) {
      this.log.info(`Removing ${staleAccessories.length} stale REGZA accessor${staleAccessories.length === 1 ? 'y' : 'ies'}.`);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, staleAccessories);
    }
  }

  private logDeviceConfig(device: RegzaDeviceConfig): void {
    const inputs = device.inputs?.length ?? 0;
    this.log.info(
      `Configured REGZA TV: ${device.name} ` +
      `(ip=${device.ip}, protocol=${device.protocol ?? 'https'}, port=${device.port ?? (device.protocol === 'http' ? 80 : 4430)}, ` +
      `mac=${device.mac ? 'configured' : 'not configured'}, username=${device.username ? 'configured' : 'missing'}, ` +
      `password=${device.password ? 'configured' : 'missing'}, model=${device.model ?? 'custom'}, ` +
      `powerMode=${device.powerMode ?? 'discrete'}, powerOnKey=${device.powerOnKey ?? RemoteKeys.POWER_ON}, ` +
      `powerOffKey=${device.powerOffKey ?? RemoteKeys.POWER_OFF}, powerToggleKey=${device.powerToggleKey ?? device.powerKey ?? RemoteKeys.POWER_TOGGLE}, ` +
      `wol=${device.enableWakeOnLan === true ? 'enabled' : 'disabled'}, inputs=${inputs || 'default'})`,
    );
  }


  private normalizeDeviceConfig(device: RegzaDeviceConfig): RegzaDeviceConfig {
    const usesLegacyPowerKey = device.powerMode === undefined
      && device.powerKey !== undefined
      && device.powerOnKey === undefined
      && device.powerOffKey === undefined;

    const profiled = applyModelProfile({
      model: MODEL_55J10X,
      ...device,
    });

    const powerToggleKey = profiled.powerToggleKey ?? profiled.powerKey ?? RemoteKeys.POWER_TOGGLE;

    return {
      ...profiled,
      protocol: profiled.protocol ?? 'https',
      port: profiled.port ?? (profiled.protocol === 'http' ? 80 : 4430),
      allowSelfSignedCertificate: profiled.allowSelfSignedCertificate ?? true,
      // A v0.1.x config containing only powerKey used toggle semantics.
      powerMode: usesLegacyPowerKey ? 'toggle' : profiled.powerMode ?? 'discrete',
      powerOnKey: profiled.powerOnKey ?? RemoteKeys.POWER_ON,
      powerOffKey: profiled.powerOffKey ?? RemoteKeys.POWER_OFF,
      powerToggleKey,
      requestTimeoutMs: profiled.requestTimeoutMs ?? 5000,
    } as RegzaDeviceConfig;
  }

  private getDevices(): Partial<RegzaDeviceConfig>[] {
    return this.config.devices ?? this.config.tvs ?? [];
  }

  private isValidDevice(device: Partial<RegzaDeviceConfig>): device is RegzaDeviceConfig {
    return Boolean(device.name && device.ip && device.username && device.password);
  }
}
