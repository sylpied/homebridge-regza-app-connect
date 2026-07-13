"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegzaPlatform = void 0;
exports.getDeviceIdentity = getDeviceIdentity;
const settings_1 = require("./settings");
const platformAccessory_1 = require("./platformAccessory");
const modelProfiles_1 = require("./modelProfiles");
const remoteKeys_1 = require("./remoteKeys");
function getDeviceIdentity(device) {
    return (device.mac || device.ip).trim().toLowerCase();
}
class RegzaPlatform {
    log;
    config;
    api;
    Service;
    Characteristic;
    cachedAccessories = [];
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.Service = this.api.hap.Service;
        this.Characteristic = this.api.hap.Characteristic;
        this.log.debug('Finished initializing REGZA App Connect platform.');
        this.api.on('didFinishLaunching', () => this.discoverDevices());
    }
    configureAccessory(accessory) {
        this.log.info(`Loading cached REGZA accessory: ${accessory.displayName}`);
        this.cachedAccessories.push(accessory);
    }
    discoverDevices() {
        const devices = this.getDevices();
        const configuredUuids = new Set();
        this.log.info(`REGZA App Connect configuration: ${devices.length} device${devices.length === 1 ? '' : 's'} configured, debug=${this.config.debug ? 'enabled' : 'disabled'}.`);
        for (const device of devices) {
            if (!this.isValidDevice(device)) {
                this.log.warn(`Skipping REGZA TV because name, ip, username, or password is missing. name=${device.name ?? 'missing'}, ip=${device.ip ?? 'missing'}, username=${device.username ? 'configured' : 'missing'}, password=${device.password ? 'configured' : 'missing'}`);
                continue;
            }
            const normalizedDevice = this.normalizeDeviceConfig(device);
            this.logDeviceConfig(normalizedDevice);
            const identity = getDeviceIdentity(normalizedDevice);
            const uuid = this.api.hap.uuid.generate(`${settings_1.PLUGIN_NAME}:${identity}`);
            const legacyUuid = this.api.hap.uuid.generate(`${settings_1.PLUGIN_NAME}:${normalizedDevice.mac ?? normalizedDevice.ip}:${normalizedDevice.name}`);
            const existingAccessory = this.cachedAccessories.find(accessory => {
                const cachedDevice = accessory.context.device;
                const cachedIdentity = cachedDevice?.ip
                    ? getDeviceIdentity({ ip: cachedDevice.ip, mac: cachedDevice.mac })
                    : undefined;
                return accessory.UUID === uuid || accessory.UUID === legacyUuid || cachedIdentity === identity;
            });
            if (existingAccessory) {
                configuredUuids.add(existingAccessory.UUID);
                this.log.info(`Restoring REGZA TV from cache: ${normalizedDevice.name}`);
                existingAccessory.context.device = normalizedDevice;
                new platformAccessory_1.RegzaTvAccessory(this, existingAccessory, normalizedDevice);
                continue;
            }
            configuredUuids.add(uuid);
            this.log.info(`Adding new REGZA TV: ${normalizedDevice.name}`);
            const accessory = new this.api.platformAccessory(normalizedDevice.name, uuid);
            accessory.context.device = normalizedDevice;
            new platformAccessory_1.RegzaTvAccessory(this, accessory, normalizedDevice);
            this.api.registerPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [accessory]);
        }
        const staleAccessories = this.cachedAccessories.filter(accessory => !configuredUuids.has(accessory.UUID));
        if (staleAccessories.length > 0) {
            this.log.info(`Removing ${staleAccessories.length} stale REGZA accessor${staleAccessories.length === 1 ? 'y' : 'ies'}.`);
            this.api.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, staleAccessories);
        }
    }
    logDeviceConfig(device) {
        const inputs = device.inputs?.length ?? 0;
        this.log.info(`Configured REGZA TV: ${device.name} ` +
            `(ip=${device.ip}, protocol=${device.protocol ?? 'https'}, port=${device.port ?? (device.protocol === 'http' ? 80 : 4430)}, ` +
            `mac=${device.mac ? 'configured' : 'not configured'}, username=${device.username ? 'configured' : 'missing'}, ` +
            `password=${device.password ? 'configured' : 'missing'}, model=${device.model ?? 'custom'}, ` +
            `powerMode=${device.powerMode ?? 'discrete'}, powerOnKey=${device.powerOnKey ?? remoteKeys_1.RemoteKeys.POWER_ON}, ` +
            `powerOffKey=${device.powerOffKey ?? remoteKeys_1.RemoteKeys.POWER_OFF}, powerToggleKey=${device.powerToggleKey ?? device.powerKey ?? remoteKeys_1.RemoteKeys.POWER_TOGGLE}, ` +
            `wol=${device.enableWakeOnLan === true ? 'enabled' : 'disabled'}, inputs=${inputs || 'default'})`);
    }
    normalizeDeviceConfig(device) {
        const usesLegacyPowerKey = device.powerMode === undefined
            && device.powerKey !== undefined
            && device.powerOnKey === undefined
            && device.powerOffKey === undefined;
        const profiled = (0, modelProfiles_1.applyModelProfile)({
            model: modelProfiles_1.MODEL_55J10X,
            ...device,
        });
        const powerToggleKey = profiled.powerToggleKey ?? profiled.powerKey ?? remoteKeys_1.RemoteKeys.POWER_TOGGLE;
        return {
            ...profiled,
            protocol: profiled.protocol ?? 'https',
            port: profiled.port ?? (profiled.protocol === 'http' ? 80 : 4430),
            allowSelfSignedCertificate: profiled.allowSelfSignedCertificate ?? true,
            // A v0.1.x config containing only powerKey used toggle semantics.
            powerMode: usesLegacyPowerKey ? 'toggle' : profiled.powerMode ?? 'discrete',
            powerOnKey: profiled.powerOnKey ?? remoteKeys_1.RemoteKeys.POWER_ON,
            powerOffKey: profiled.powerOffKey ?? remoteKeys_1.RemoteKeys.POWER_OFF,
            powerToggleKey,
            requestTimeoutMs: profiled.requestTimeoutMs ?? 5000,
        };
    }
    getDevices() {
        return this.config.devices ?? this.config.tvs ?? [];
    }
    isValidDevice(device) {
        return Boolean(device.name && device.ip && device.username && device.password);
    }
}
exports.RegzaPlatform = RegzaPlatform;
//# sourceMappingURL=platform.js.map