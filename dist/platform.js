"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegzaPlatform = void 0;
const settings_1 = require("./settings");
const platformAccessory_1 = require("./platformAccessory");
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
            this.logDeviceConfig(device);
            const uuid = this.api.hap.uuid.generate(`${settings_1.PLUGIN_NAME}:${device.mac ?? device.ip}:${device.name}`);
            configuredUuids.add(uuid);
            const existingAccessory = this.cachedAccessories.find(accessory => accessory.UUID === uuid);
            if (existingAccessory) {
                this.log.info(`Restoring REGZA TV from cache: ${device.name}`);
                existingAccessory.context.device = device;
                new platformAccessory_1.RegzaTvAccessory(this, existingAccessory, device);
                continue;
            }
            this.log.info(`Adding new REGZA TV: ${device.name}`);
            const accessory = new this.api.platformAccessory(device.name, uuid);
            accessory.context.device = device;
            new platformAccessory_1.RegzaTvAccessory(this, accessory, device);
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
            `password=${device.password ? 'configured' : 'missing'}, powerKey=${device.powerKey ?? '40BF12'}, ` +
            `wol=${device.enableWakeOnLan === true ? 'enabled' : 'disabled'}, inputs=${inputs || 'default'})`);
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