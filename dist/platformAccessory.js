"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegzaTvAccessory = void 0;
exports.shouldPrepareOperationWake = shouldPrepareOperationWake;
const wake_on_lan_1 = __importDefault(require("wake_on_lan"));
const settings_1 = require("./settings");
const regzaClient_1 = require("./regzaClient");
function shouldPrepareOperationWake(powerMode, idleMs, thresholdMs) {
    return powerMode === 'discrete' && idleMs >= thresholdMs;
}
class RegzaTvAccessory {
    platform;
    accessory;
    device;
    client;
    tvService;
    speakerService;
    active = false;
    muted = false;
    currentInput = 1;
    powerProbeRunning = false;
    powerStateConfirmedAt = 0;
    lastUserOperationAt = 0;
    statusPollFailureCount = 0;
    navigationModeActive = false;
    navigationSelectionMade = false;
    navigationTimer;
    stalePowerProbeTimer;
    muteOperationQueue = Promise.resolve();
    constructor(platform, accessory, device) {
        this.platform = platform;
        this.accessory = accessory;
        this.device = device;
        this.client = new regzaClient_1.RegzaClient({
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
    configureTelevision() {
        this.tvService
            .setCharacteristic(this.platform.Characteristic.ConfiguredName, this.device.name)
            .setCharacteristic(this.platform.Characteristic.SleepDiscoveryMode, this.platform.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);
        this.tvService.getCharacteristic(this.platform.Characteristic.Active)
            .onGet(() => this.active ? this.platform.Characteristic.Active.ACTIVE : this.platform.Characteristic.Active.INACTIVE)
            .onSet(async (value) => this.setActive(value));
        this.tvService.getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
            .onGet(() => this.currentInput)
            .onSet(async (value) => this.setInput(Number(value)));
        this.tvService.getCharacteristic(this.platform.Characteristic.RemoteKey)
            .onSet(async (value) => this.handleRemoteKey(Number(value)));
    }
    configureSpeaker() {
        this.speakerService
            .setCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.ACTIVE)
            .setCharacteristic(this.platform.Characteristic.VolumeControlType, this.platform.Characteristic.VolumeControlType.RELATIVE);
        this.speakerService.getCharacteristic(this.platform.Characteristic.Mute)
            .onGet(() => this.muted)
            .onSet(async (value) => this.setMute(Boolean(value)));
        this.speakerService.getCharacteristic(this.platform.Characteristic.VolumeSelector)
            .onSet(async (value) => {
            await this.prepareOperationWake();
            if (value === this.platform.Characteristic.VolumeSelector.INCREMENT) {
                await this.client.volumeUp();
            }
            else {
                await this.client.volumeDown();
            }
            this.recordUserOperation();
        });
        this.tvService.addLinkedService(this.speakerService);
    }
    configureInputs() {
        const inputs = this.getInputs();
        const configuredSubtypes = new Set(inputs.map((input, index) => `input-${input.identifier ?? index + 1}`));
        for (const service of [...this.accessory.services]) {
            if (service.UUID === this.platform.Service.InputSource.UUID
                && service.subtype?.startsWith('input-')
                && !configuredSubtypes.has(service.subtype)) {
                this.tvService.removeLinkedService(service);
                this.accessory.removeService(service);
                this.platform.log.info(`Removed stale REGZA input from ${this.device.name}: ${service.displayName}.`);
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
    async setActive(value) {
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
        }
        else {
            await this.client.powerOff();
            this.endNavigationMode();
        }
        this.updatePowerState(shouldBeActive, true);
        this.recordUserOperation();
    }
    async setInput(identifier) {
        const input = this.getInputs().find(item => (item.identifier ?? this.getInputs().indexOf(item) + 1) === identifier);
        if (input) {
            if (identifier >= 1 && identifier <= 3) {
                await this.prepareOperationWake();
            }
            this.platform.log.info(`Switching ${this.device.name} to input ${input.name} using key=${input.key}.`);
            await this.client.sendKey(input.key);
            this.currentInput = identifier;
            this.accessory.context.currentInput = identifier;
            this.tvService.updateCharacteristic(this.platform.Characteristic.ActiveIdentifier, identifier);
            this.recordUserOperation();
            if (identifier >= 1 && identifier <= 3) {
                await this.sleep(750);
                await this.pollStatus();
            }
        }
    }
    async handleRemoteKey(value) {
        const previousOperationAt = this.lastUserOperationAt;
        switch (value) {
            case this.platform.Characteristic.RemoteKey.ARROW_UP:
                if (this.navigationModeActive || this.device.contextualRemoteArrows === false) {
                    await this.client.sendKey('up');
                    this.refreshNavigationTimeout();
                }
                else {
                    await this.prepareOperationWake(previousOperationAt);
                    await this.client.channelUp();
                }
                break;
            case this.platform.Characteristic.RemoteKey.ARROW_DOWN:
                if (this.navigationModeActive || this.device.contextualRemoteArrows === false) {
                    await this.client.sendKey('down');
                    this.refreshNavigationTimeout();
                }
                else {
                    await this.prepareOperationWake(previousOperationAt);
                    await this.client.channelDown();
                }
                break;
            case this.platform.Characteristic.RemoteKey.ARROW_LEFT:
                if (this.navigationModeActive || this.device.contextualRemoteArrows === false) {
                    await this.client.sendKey('left');
                    this.refreshNavigationTimeout();
                }
                else {
                    await this.cycleBroadcastBand(-1);
                }
                break;
            case this.platform.Characteristic.RemoteKey.ARROW_RIGHT:
                if (this.navigationModeActive || this.device.contextualRemoteArrows === false) {
                    await this.client.sendKey('right');
                    this.refreshNavigationTimeout();
                }
                else {
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
    async handleSelectKey() {
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
        this.platform.log.debug(`Navigation mode started for ${this.device.name} using ${openingKey}.`);
    }
    async cycleBroadcastBand(direction) {
        await this.prepareOperationWake();
        const broadcastIdentifiers = [1, 2, 3];
        const currentIndex = broadcastIdentifiers.indexOf(this.currentInput);
        const targetIdentifier = currentIndex === -1
            ? 1
            : broadcastIdentifiers[(currentIndex + direction + broadcastIdentifiers.length) % broadcastIdentifiers.length];
        const targetKey = targetIdentifier === 2 ? 'bs' : targetIdentifier === 3 ? 'cs' : 'terrestrial';
        await this.client.sendKey(targetKey);
        this.currentInput = targetIdentifier;
        this.accessory.context.currentInput = targetIdentifier;
        this.tvService.updateCharacteristic(this.platform.Characteristic.ActiveIdentifier, targetIdentifier);
        await this.sleep(750);
        await this.pollStatus();
    }
    refreshNavigationTimeout() {
        if (!this.navigationModeActive) {
            return;
        }
        if (this.navigationSelectionMade) {
            this.scheduleNavigationReset(this.device.navigationPostSelectResetSeconds ?? 15, true);
        }
        else {
            this.scheduleNavigationReset(this.device.navigationTimeoutSeconds ?? 60, false);
        }
    }
    scheduleNavigationReset(timeoutSeconds, closeMenu = false) {
        if (this.navigationTimer) {
            clearTimeout(this.navigationTimer);
        }
        this.navigationTimer = setTimeout(() => {
            if (closeMenu) {
                void this.closeNavigationMenu();
            }
            else {
                this.endNavigationMode();
            }
        }, timeoutSeconds * 1000);
        this.navigationTimer.unref();
    }
    async closeNavigationMenu() {
        try {
            await this.client.sendKey('return');
            this.platform.log.debug(`Navigation menu auto-closed for ${this.device.name}.`);
        }
        catch (error) {
            this.platform.log.warn(`Unable to auto-close navigation menu for ${this.device.name}: ` +
                `${error instanceof Error ? error.message : String(error)}`);
        }
        finally {
            this.endNavigationMode();
        }
    }
    endNavigationMode() {
        if (this.navigationTimer) {
            clearTimeout(this.navigationTimer);
            this.navigationTimer = undefined;
        }
        this.navigationModeActive = false;
        this.navigationSelectionMade = false;
    }
    getInputs() {
        return this.device.inputs?.length ? this.device.inputs : settings_1.DEFAULT_INPUTS;
    }
    startStatusPolling() {
        const intervalSeconds = this.device.pollingInterval ?? 30;
        if (intervalSeconds <= 0) {
            return;
        }
        const timer = setInterval(() => void this.pollStatus(), intervalSeconds * 1000);
        timer.unref();
        setTimeout(() => void this.pollStatus(), 1000).unref();
    }
    startPowerProbing() {
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
    async probePowerStatus(force) {
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
            const detectedActive = playback.status === 0 && playback.content_type === 'broadcast'
                ? true
                : await this.withMuteOperationLock(() => this.client.probePowerWithMute(this.device.operationCommandDelayMs ?? 250));
            const changed = detectedActive !== this.active;
            this.updatePowerState(detectedActive, true);
            if (changed) {
                this.platform.log.info(`REGZA power probe: ${this.device.name} is ${detectedActive ? 'ON' : 'OFF'}.`);
            }
        }
        catch (error) {
            this.platform.log.warn(`Unable to probe REGZA power state for ${this.device.name}: ` +
                `${error instanceof Error ? error.message : String(error)}`);
        }
        finally {
            this.powerProbeRunning = false;
        }
    }
    async pollStatus() {
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
                }
                else if (playback.content_type === 'broadcast') {
                    this.updatePowerState(true, true);
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
            if (this.statusPollFailureCount > 0) {
                if (this.platform.config.debug === true) {
                    this.platform.log.debug(`REGZA v2 status polling recovered for ${this.device.name} after ` +
                        `${this.statusPollFailureCount} failed attempt${this.statusPollFailureCount === 1 ? '' : 's'}.`);
                }
                this.statusPollFailureCount = 0;
            }
        }
        catch (error) {
            this.statusPollFailureCount += 1;
            if (this.platform.config.debug === true && this.statusPollFailureCount === 1) {
                this.platform.log.debug(`Unable to poll REGZA v2 status for ${this.device.name}: ` +
                    `${error instanceof Error ? error.message : String(error)}. ` +
                    'Further consecutive failures will be suppressed until polling recovers.');
            }
        }
    }
    async setMute(targetMuted) {
        await this.prepareOperationWake();
        await this.withMuteOperationLock(() => this.setMuteUnlocked(targetMuted));
    }
    async setMuteUnlocked(targetMuted) {
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
    wake(mac) {
        return new Promise((resolve, reject) => {
            wake_on_lan_1.default.wake(mac, { address: this.device.wakeOnLanAddress ?? '192.168.100.255', port: this.device.wakeOnLanPort ?? 2304 }, error => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
    }
    updatePowerState(active, confirmed) {
        this.active = active;
        this.accessory.context.active = active;
        if (confirmed) {
            this.powerStateConfirmedAt = Date.now();
        }
        this.tvService.updateCharacteristic(this.platform.Characteristic.Active, active
            ? this.platform.Characteristic.Active.ACTIVE
            : this.platform.Characteristic.Active.INACTIVE);
    }
    async prepareOperationWake(previousOperationAt = this.lastUserOperationAt) {
        const now = Date.now();
        const wakeThresholdMs = (this.device.operationPowerOnThresholdSeconds ?? 30) * 1000;
        if (!shouldPrepareOperationWake(this.device.powerMode, now - previousOperationAt, wakeThresholdMs)) {
            return;
        }
        await this.client.powerOn();
        this.updatePowerState(true, true);
        await this.sleep(this.device.operationCommandDelayMs ?? 250);
    }
    recordUserOperation() {
        this.lastUserOperationAt = Date.now();
        this.accessory.context.lastUserOperationAt = this.lastUserOperationAt;
        this.scheduleStalePowerProbe();
    }
    scheduleStalePowerProbe() {
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
    async runStalePowerProbe() {
        if (this.navigationModeActive || this.powerProbeRunning) {
            this.stalePowerProbeTimer = setTimeout(() => void this.runStalePowerProbe(), 60_000);
            this.stalePowerProbeTimer.unref();
            return;
        }
        await this.probePowerStatus(true);
    }
    async withMuteOperationLock(operation) {
        const previous = this.muteOperationQueue;
        let release = () => undefined;
        this.muteOperationQueue = new Promise(resolve => {
            release = resolve;
        });
        await previous;
        try {
            return await operation();
        }
        finally {
            release();
        }
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.RegzaTvAccessory = RegzaTvAccessory;
//# sourceMappingURL=platformAccessory.js.map