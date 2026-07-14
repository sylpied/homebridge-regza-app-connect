import type { API, DynamicPlatformPlugin, Logging, PlatformAccessory } from 'homebridge';
import { DEFAULT_INPUTS, PLATFORM_NAME, PLUGIN_NAME, RegzaDeviceConfig, RegzaInputConfig, RegzaPlatformConfig, SelectKeyMode } from './settings';
import { RegzaTvAccessory } from './platformAccessory';
import { applyModelProfile, MODEL_55J10X, MODEL_DBR_M590 } from './modelProfiles';
import { RemoteKeys } from './remoteKeys';

export function getDeviceIdentity(device: Pick<RegzaDeviceConfig, 'ip' | 'mac' | 'deviceType'>): string {
  const type = device.deviceType ?? 'tv';
  // Recorders do not use Wake on LAN in the verified profile. Keep their
  // HomeKit identity stable when an optional MAC address is added or removed.
  const address = type === 'recorder' ? device.ip : device.mac || device.ip;
  return `${type}:${address.trim().toLowerCase()}`;
}

export function migrateSelectKeyMode(model: string | undefined, mode: SelectKeyMode | undefined): SelectKeyMode | undefined {
  if (model === MODEL_DBR_M590 && (mode === 'normal' || mode === 'guideFirst' || mode === 'timeshiftFirst')) {
    return 'menuFirst';
  }
  return mode;
}

export function getEffectiveModel(device: Pick<RegzaDeviceConfig, 'model' | 'deviceType'>): string {
  if (device.model === 'custom') {
    return 'custom';
  }
  if (device.deviceType === 'recorder') {
    return MODEL_DBR_M590;
  }
  return device.model || MODEL_55J10X;
}

export function migrateDefaultInputNames(
  model: string,
  inputs: RegzaInputConfig[] | undefined,
): RegzaInputConfig[] | undefined {
  if (model !== MODEL_55J10X || !inputs?.length) {
    return inputs;
  }
  return inputs.map((input, index) => {
    if (/^HDMI(?:（次のアクティブ入力）|\s*\(Next Active\))$/i.test(input.name.trim())) {
      return { ...input, name: 'HDMI Next Active' };
    }
    if (!/^(?:Input Source|入力ソース)\s*\d+$/i.test(input.name.trim())) {
      return input;
    }
    const replacement = DEFAULT_INPUTS[index];
    return replacement ? { ...replacement, identifier: input.identifier ?? replacement.identifier } : input;
  });
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
    const normalizedDevices = devices
      .filter((device): device is RegzaDeviceConfig => this.isValidDevice(device))
      .map(device => this.normalizeDeviceConfig(device));
    const configuredUuids = new Set<string>();

    this.log.info(`REGZA App Connect configuration: ${devices.length} device${devices.length === 1 ? '' : 's'} configured, debug=${this.config.debug ? 'enabled' : 'disabled'}.`);

    for (const device of devices) {
      if (!this.isValidDevice(device)) {
        this.log.warn(`Skipping REGZA TV because name, ip, username, or password is missing. name=${device.name ?? 'missing'}, ip=${device.ip ?? 'missing'}, username=${device.username ? 'configured' : 'missing'}, password=${device.password ? 'configured' : 'missing'}`);
        continue;
      }

      const normalizedDevice = this.normalizeDeviceConfig(device);
      const publishExternally = normalizedDevice.publishMode === 'external';
      const volumeControlDevice = normalizedDevice.deviceType === 'recorder'
        ? normalizedDevices.find(candidate => candidate.deviceType !== 'recorder')
        : undefined;

      this.logDeviceConfig(normalizedDevice);

      const identity = getDeviceIdentity(normalizedDevice);
      const uuid = this.api.hap.uuid.generate(`${PLUGIN_NAME}:${identity}`);
      const legacyUuid = this.api.hap.uuid.generate(
        `${PLUGIN_NAME}:${normalizedDevice.mac ?? normalizedDevice.ip}:${normalizedDevice.name}`,
      );
      const existingAccessory = this.cachedAccessories.find(accessory => {
        const cachedDevice = accessory.context.device as Partial<RegzaDeviceConfig> | undefined;
        const cachedIdentity = cachedDevice?.ip
          ? getDeviceIdentity({
            ip: cachedDevice.ip,
            mac: cachedDevice.mac,
            deviceType: cachedDevice.deviceType ?? (cachedDevice.model === 'DBR-M590' ? 'recorder' : 'tv'),
          })
          : undefined;
        return accessory.UUID === uuid || accessory.UUID === legacyUuid || cachedIdentity === identity;
      });
      if (publishExternally) {
        if (existingAccessory) {
          this.log.info(`Migrating ${normalizedDevice.name} from the child bridge to a standalone HomeKit accessory.`);
          this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
          const cachedIndex = this.cachedAccessories.indexOf(existingAccessory);
          if (cachedIndex >= 0) {
            this.cachedAccessories.splice(cachedIndex, 1);
          }
        }

        const accessory = new this.api.platformAccessory(normalizedDevice.name, uuid);
        accessory.category = this.api.hap.Categories.TELEVISION;
        accessory.context.device = normalizedDevice;
        new RegzaTvAccessory(this, accessory, normalizedDevice, volumeControlDevice);
        this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
        this.log.info(
          `Published ${normalizedDevice.name} as a standalone HomeKit accessory. ` +
          'Add it once in the Home app with the Homebridge setup code.',
        );
        continue;
      }

      if (existingAccessory) {
        configuredUuids.add(existingAccessory.UUID);
        this.log.info(`Restoring REGZA TV from cache: ${normalizedDevice.name}`);
        existingAccessory.category = this.api.hap.Categories.TELEVISION;
        existingAccessory.context.device = normalizedDevice;
        new RegzaTvAccessory(this, existingAccessory, normalizedDevice, volumeControlDevice);
        this.api.updatePlatformAccessories([existingAccessory]);
        continue;
      }

      configuredUuids.add(uuid);
      this.log.info(`Adding new REGZA TV: ${normalizedDevice.name}`);
      const accessory = new this.api.platformAccessory(normalizedDevice.name, uuid);
      accessory.category = this.api.hap.Categories.TELEVISION;
      accessory.context.device = normalizedDevice;
      new RegzaTvAccessory(this, accessory, normalizedDevice, volumeControlDevice);
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
      `deviceType=${device.deviceType ?? 'tv'}, publishMode=${device.publishMode ?? 'external'}, ` +
      `powerMode=${device.powerMode ?? 'discrete'}, powerOnKey=${device.powerOnKey ?? RemoteKeys.POWER_ON}, ` +
      `powerOffKey=${device.powerOffKey ?? RemoteKeys.POWER_OFF}, powerToggleKey=${device.powerToggleKey ?? device.powerKey ?? RemoteKeys.POWER_TOGGLE}, ` +
      `wol=${device.enableWakeOnLan === true ? 'enabled' : 'disabled'}, inputs=${inputs || 'default'})`,
    );
    this.log.info(
      `Remote profile for ${device.name}: selectKeyMode=${device.selectKeyMode ?? 'guideFirst'}, ` +
      `contextualRemoteArrows=${device.contextualRemoteArrows !== false ? 'enabled' : 'disabled'}.`,
    );
  }


  private normalizeDeviceConfig(device: RegzaDeviceConfig): RegzaDeviceConfig {
    const usesLegacyPowerKey = device.powerMode === undefined
      && device.powerKey !== undefined
      && device.powerOnKey === undefined
      && device.powerOffKey === undefined;

    const effectiveModel = getEffectiveModel(device);
    const profiled = applyModelProfile({
      ...device,
      model: effectiveModel,
    });

    // Migrate known models away from the child-bridge value written by early
    // v0.8 test builds. Each must be an independent Television accessory.
    if (effectiveModel === MODEL_55J10X || effectiveModel === MODEL_DBR_M590) {
      profiled.publishMode = 'external';
    }

    // Early DBR test builds used guideFirst, normal, or an incorrectly
    // identified Time Shift key. Migrate them to the verified Start Menu.
    profiled.selectKeyMode = migrateSelectKeyMode(profiled.model, profiled.selectKeyMode);

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
      remoteResponseMode: profiled.remoteResponseMode ?? 'zero',
      supportsV2Status: profiled.supportsV2Status ?? true,
      supportsVolumeControl: profiled.supportsVolumeControl ?? true,
      deviceType: profiled.deviceType ?? 'tv',
      publishMode: profiled.publishMode ?? (profiled.deviceType === 'recorder' ? 'external' : 'bridged'),
      inputs: migrateDefaultInputNames(effectiveModel, profiled.inputs),
    } as RegzaDeviceConfig;
  }

  private getDevices(): Partial<RegzaDeviceConfig>[] {
    return this.config.devices ?? this.config.tvs ?? [];
  }

  private isValidDevice(device: Partial<RegzaDeviceConfig>): device is RegzaDeviceConfig {
    return Boolean(device.name && device.ip && device.username && device.password);
  }
}
