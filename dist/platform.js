"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegzaPlatform = void 0;
exports.getDeviceIdentity = getDeviceIdentity;
exports.migrateSelectKeyMode = migrateSelectKeyMode;
exports.getEffectiveModel = getEffectiveModel;
exports.migrateDefaultInputNames = migrateDefaultInputNames;
exports.shouldScheduleLinkedRecorderPowerOff = shouldScheduleLinkedRecorderPowerOff;
const settings_1 = require("./settings");
const platformAccessory_1 = require("./platformAccessory");
const modelProfiles_1 = require("./modelProfiles");
const remoteKeys_1 = require("./remoteKeys");
function getDeviceIdentity(device) {
    const type = device.deviceType ?? 'tv';
    // Recorders do not use Wake on LAN in the verified profile. Keep their
    // HomeKit identity stable when an optional MAC address is added or removed.
    const address = type === 'recorder' ? device.ip : device.mac || device.ip;
    return `${type}:${address.trim().toLowerCase()}`;
}
function migrateSelectKeyMode(model, mode) {
    if (model === modelProfiles_1.MODEL_DBR_M590 && (mode === 'normal' || mode === 'guideFirst' || mode === 'timeshiftFirst')) {
        return 'menuFirst';
    }
    return mode;
}
function getEffectiveModel(device) {
    if (device.model === 'custom') {
        return 'custom';
    }
    if (device.deviceType === 'recorder') {
        return modelProfiles_1.MODEL_DBR_M590;
    }
    return device.model || modelProfiles_1.MODEL_55J10X;
}
function migrateDefaultInputNames(model, inputs) {
    if (model !== modelProfiles_1.MODEL_55J10X || !inputs?.length) {
        return inputs;
    }
    return inputs.map((input, index) => {
        if (/^HDMI(?:\s+Next Active|（次のアクティブ入力）|\s*\(Next Active\))$/i.test(input.name.trim())) {
            return { ...input, name: 'HDMI' };
        }
        if (!/^(?:Input Source|入力ソース)\s*\d+$/i.test(input.name.trim())) {
            return input;
        }
        const replacement = settings_1.DEFAULT_INPUTS[index];
        return replacement ? { ...replacement, identifier: input.identifier ?? replacement.identifier } : input;
    });
}
function shouldScheduleLinkedRecorderPowerOff(previous, active) {
    return previous === true && !active;
}
class RegzaPlatform {
    log;
    config;
    api;
    Service;
    Characteristic;
    cachedAccessories = [];
    devicePowerStates = new Map();
    linkedRecorderPowerOffHandlers = new Map();
    linkedRecorderPowerOffTimers = new Map();
    updateDevicePowerState(ip, active) {
        const previous = this.devicePowerStates.get(ip);
        this.devicePowerStates.set(ip, active);
        if (active) {
            for (const timer of this.linkedRecorderPowerOffTimers.get(ip) ?? []) {
                clearTimeout(timer);
            }
            this.linkedRecorderPowerOffTimers.delete(ip);
            return;
        }
        // Do not wake recorders merely because Homebridge started while the TV was
        // already off. Only a confirmed ON -> OFF transition schedules alignment.
        if (!shouldScheduleLinkedRecorderPowerOff(previous, active)) {
            return;
        }
        const timers = (this.linkedRecorderPowerOffHandlers.get(ip) ?? []).map(({ delayMs, handler }) => setTimeout(() => {
            void handler().catch(error => {
                this.log.warn(`Unable to align linked recorder power after TV ${ip} turned OFF: ` +
                    `${error instanceof Error ? error.message : String(error)}`);
            });
        }, delayMs));
        if (timers.length > 0) {
            this.linkedRecorderPowerOffTimers.set(ip, timers);
        }
    }
    getDevicePowerState(ip) {
        return this.devicePowerStates.get(ip);
    }
    registerLinkedRecorderPowerOff(tvIp, delaySeconds, handler) {
        const registrations = this.linkedRecorderPowerOffHandlers.get(tvIp) ?? [];
        registrations.push({ delayMs: Math.max(0, delaySeconds) * 1000, handler });
        this.linkedRecorderPowerOffHandlers.set(tvIp, registrations);
    }
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
        const normalizedDevices = devices
            .filter((device) => this.isValidDevice(device))
            .map(device => this.normalizeDeviceConfig(device));
        const configuredUuids = new Set();
        this.log.info(`REGZA App Connect configuration: ${devices.length} device${devices.length === 1 ? '' : 's'} configured, debug=${this.config.debug ? 'enabled' : 'disabled'}.`);
        for (const device of devices) {
            if (!this.isValidDevice(device)) {
                this.log.warn(`Skipping REGZA TV because name, ip, username, or password is missing. name=${device.name ?? 'missing'}, ip=${device.ip ?? 'missing'}, username=${device.username ? 'configured' : 'missing'}, password=${device.password ? 'configured' : 'missing'}`);
                continue;
            }
            const normalizedDevice = this.normalizeDeviceConfig(device);
            const publishExternally = normalizedDevice.publishMode === 'external';
            const tvDevices = normalizedDevices.filter(candidate => candidate.deviceType !== 'recorder');
            const volumeControlDevice = normalizedDevice.deviceType === 'recorder'
                ? tvDevices.find(candidate => candidate.ip === normalizedDevice.recorderLinkedTvIp) ?? tvDevices[0]
                : undefined;
            this.logDeviceConfig(normalizedDevice);
            const identity = getDeviceIdentity(normalizedDevice);
            const uuid = this.api.hap.uuid.generate(`${settings_1.PLUGIN_NAME}:${identity}`);
            const legacyUuid = this.api.hap.uuid.generate(`${settings_1.PLUGIN_NAME}:${normalizedDevice.mac ?? normalizedDevice.ip}:${normalizedDevice.name}`);
            const existingAccessory = this.cachedAccessories.find(accessory => {
                const cachedDevice = accessory.context.device;
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
                    this.api.unregisterPlatformAccessories(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, [existingAccessory]);
                    const cachedIndex = this.cachedAccessories.indexOf(existingAccessory);
                    if (cachedIndex >= 0) {
                        this.cachedAccessories.splice(cachedIndex, 1);
                    }
                }
                const accessory = new this.api.platformAccessory(normalizedDevice.name, uuid);
                accessory.category = 31 /* this.api.hap.Categories.TELEVISION */;
                accessory.context.device = normalizedDevice;
                new platformAccessory_1.RegzaTvAccessory(this, accessory, normalizedDevice, volumeControlDevice);
                this.api.publishExternalAccessories(settings_1.PLUGIN_NAME, [accessory]);
                this.log.info(`Published ${normalizedDevice.name} as a standalone HomeKit accessory. ` +
                    'Add it once in the Home app with the Homebridge setup code.');
                continue;
            }
            if (existingAccessory) {
                configuredUuids.add(existingAccessory.UUID);
                this.log.info(`Restoring REGZA TV from cache: ${normalizedDevice.name}`);
                existingAccessory.category = 31 /* this.api.hap.Categories.TELEVISION */;
                existingAccessory.context.device = normalizedDevice;
                new platformAccessory_1.RegzaTvAccessory(this, existingAccessory, normalizedDevice, volumeControlDevice);
                this.api.updatePlatformAccessories([existingAccessory]);
                continue;
            }
            configuredUuids.add(uuid);
            this.log.info(`Adding new REGZA TV: ${normalizedDevice.name}`);
            const accessory = new this.api.platformAccessory(normalizedDevice.name, uuid);
            accessory.category = 31 /* this.api.hap.Categories.TELEVISION */;
            accessory.context.device = normalizedDevice;
            new platformAccessory_1.RegzaTvAccessory(this, accessory, normalizedDevice, volumeControlDevice);
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
            `deviceType=${device.deviceType ?? 'tv'}, publishMode=${device.publishMode ?? 'external'}, ` +
            `powerMode=${device.powerMode ?? 'discrete'}, powerOnKey=${device.powerOnKey ?? remoteKeys_1.RemoteKeys.POWER_ON}, ` +
            `powerOffKey=${device.powerOffKey ?? remoteKeys_1.RemoteKeys.POWER_OFF}, powerToggleKey=${device.powerToggleKey ?? device.powerKey ?? remoteKeys_1.RemoteKeys.POWER_TOGGLE}, ` +
            `wol=${device.enableWakeOnLan === true ? 'enabled' : 'disabled'}, inputs=${inputs || 'default'})`);
        this.log.info(`Remote profile for ${device.name}: selectKeyMode=${device.selectKeyMode ?? 'guideFirst'}, ` +
            `contextualRemoteArrows=${device.contextualRemoteArrows !== false ? 'enabled' : 'disabled'}.`);
    }
    normalizeDeviceConfig(device) {
        const usesLegacyPowerKey = device.powerMode === undefined
            && device.powerKey !== undefined
            && device.powerOnKey === undefined
            && device.powerOffKey === undefined;
        const effectiveModel = getEffectiveModel(device);
        const profiled = (0, modelProfiles_1.applyModelProfile)({
            ...device,
            model: effectiveModel,
        });
        // Migrate known models away from the child-bridge value written by early
        // v0.8 test builds. Each must be an independent Television accessory.
        if (effectiveModel === modelProfiles_1.MODEL_55J10X || effectiveModel === modelProfiles_1.MODEL_DBR_M590) {
            profiled.publishMode = 'external';
        }
        // Early DBR test builds used guideFirst, normal, or an incorrectly
        // identified Time Shift key. Migrate them to the verified Start Menu.
        profiled.selectKeyMode = migrateSelectKeyMode(profiled.model, profiled.selectKeyMode);
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
            remoteResponseMode: profiled.remoteResponseMode ?? 'zero',
            supportsV2Status: profiled.supportsV2Status ?? true,
            supportsVolumeControl: profiled.supportsVolumeControl ?? true,
            deviceType: profiled.deviceType ?? 'tv',
            publishMode: profiled.publishMode ?? (profiled.deviceType === 'recorder' ? 'external' : 'bridged'),
            inputs: migrateDefaultInputNames(effectiveModel, profiled.inputs),
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