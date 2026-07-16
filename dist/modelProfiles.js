"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODEL_PROFILES = exports.MODEL_DBR_M590 = exports.MODEL_55J10X = exports.MODEL_CUSTOM = void 0;
exports.applyModelProfile = applyModelProfile;
const remoteKeys_1 = require("./remoteKeys");
exports.MODEL_CUSTOM = 'custom';
exports.MODEL_55J10X = '55J10X';
exports.MODEL_DBR_M590 = 'DBR-M590';
exports.MODEL_PROFILES = {
    [exports.MODEL_55J10X]: {
        deviceType: 'tv',
        publishMode: 'external',
        protocol: 'https',
        port: 4430,
        allowSelfSignedCertificate: true,
        powerMode: 'discrete',
        powerOnKey: remoteKeys_1.RemoteKeys.POWER_ON,
        powerOffKey: remoteKeys_1.RemoteKeys.POWER_OFF,
        powerToggleKey: remoteKeys_1.RemoteKeys.POWER_TOGGLE,
        enableWakeOnLan: false,
        powerOnDelaySeconds: 2,
        requestTimeoutMs: 5000,
        pollingInterval: 120,
        enableMutePowerProbe: true,
        powerProbeMode: 'operation',
        powerProbeInterval: 60,
        operationPowerOnThresholdSeconds: 30,
        stalePowerProbeHours: 8,
        operationCommandDelayMs: 250,
        selectKeyMode: 'guideFirst',
        navigationTimeoutSeconds: 60,
        navigationPostSelectResetSeconds: 15,
        contextualRemoteArrows: true,
        remoteResponseMode: 'zero',
        supportsV2Status: true,
        supportsSsdpRendererStatus: true,
        supportsVolumeControl: true,
        keyMap: {
            powerOn: remoteKeys_1.RemoteKeys.POWER_ON, powerOff: remoteKeys_1.RemoteKeys.POWER_OFF, powerToggle: remoteKeys_1.RemoteKeys.POWER_TOGGLE,
            mute: remoteKeys_1.RemoteKeys.MUTE, volumeUp: remoteKeys_1.RemoteKeys.VOLUME_UP, volumeDown: remoteKeys_1.RemoteKeys.VOLUME_DOWN,
            channelUp: remoteKeys_1.RemoteKeys.CHANNEL_UP, channelDown: remoteKeys_1.RemoteKeys.CHANNEL_DOWN,
            up: remoteKeys_1.RemoteKeys.UP, down: remoteKeys_1.RemoteKeys.DOWN, left: remoteKeys_1.RemoteKeys.LEFT, right: remoteKeys_1.RemoteKeys.RIGHT,
            enter: remoteKeys_1.RemoteKeys.ENTER, return: remoteKeys_1.RemoteKeys.RETURN, exit: remoteKeys_1.RemoteKeys.EXIT, display: remoteKeys_1.RemoteKeys.DISPLAY,
            guide: remoteKeys_1.RemoteKeys.GUIDE, menu: remoteKeys_1.RemoteKeys.MENU, quick: remoteKeys_1.RemoteKeys.QUICK, blue: remoteKeys_1.RemoteKeys.BLUE,
            terrestrial: remoteKeys_1.RemoteKeys.TERRESTRIAL, bs: remoteKeys_1.RemoteKeys.BS, cs: remoteKeys_1.RemoteKeys.CS,
            rewind: remoteKeys_1.RemoteKeys.REWIND, play: remoteKeys_1.RemoteKeys.PLAY, fastForward: remoteKeys_1.RemoteKeys.FAST_FORWARD,
            pause: remoteKeys_1.RemoteKeys.PAUSE,
        },
    },
    [exports.MODEL_DBR_M590]: {
        deviceType: 'recorder',
        // Apple Home Remote only exposes one Television service per bridge.
        // Publish recorders independently so they appear in its device picker.
        publishMode: 'external',
        protocol: 'http',
        port: 80,
        allowSelfSignedCertificate: false,
        powerMode: 'toggle',
        powerToggleKey: '12',
        recorderPowerOnLinkedTv: true,
        recorderPowerOffWithLinkedTv: true,
        recorderLinkedTvOffDelaySeconds: 5,
        recorderPowerOffDelaySeconds: 10,
        enableWakeOnLan: false,
        requestTimeoutMs: 5000,
        powerProbeMode: 'optimistic',
        enableMutePowerProbe: false,
        selectKeyMode: 'menuFirst',
        contextualRemoteArrows: false,
        remoteResponseMode: 'httpStatus',
        supportsV2Status: false,
        // The recorder has no volume control. When a TV is configured alongside
        // it, the accessory forwards HomeKit speaker controls to that TV.
        supportsVolumeControl: false,
        keyMap: {
            power: '12', powerToggle: '12',
            channelUp: '1e', channelDown: '1f',
            up: 'c0', down: 'c8', left: 'cc', right: 'c4',
            enter: '44', return: '4b', exit: '60', display: '5a',
            guide: 'b5', menu: '46', quick: '45',
            blue: '29',
            terrestrial: 'bd', bs: 'be', cs: 'bf',
            play: '13', pause: '17', stop: '16',
            rewind: '9a', fastForward: '98', previous: '84', next: '80',
            record: '15', recordingList: '6d',
        },
        inputs: [
            { name: '地デジ', key: 'bd', identifier: 1 },
            { name: 'BS', key: 'be', identifier: 2 },
            { name: 'CS', key: 'bf', identifier: 3 },
        ],
    },
};
function applyModelProfile(device) {
    const model = device.model;
    if (!model || model === exports.MODEL_CUSTOM) {
        return device;
    }
    const profile = exports.MODEL_PROFILES[model];
    if (!profile) {
        return device;
    }
    // Verified profiles must win over stale mappings left by switching between
    // TV and recorder models. Use the custom model for a custom key map.
    const keyMap = model === exports.MODEL_DBR_M590 || model === exports.MODEL_55J10X
        ? { ...(device.keyMap ?? {}), ...(profile.keyMap ?? {}) }
        : { ...(profile.keyMap ?? {}), ...(device.keyMap ?? {}) };
    return {
        ...profile,
        ...device,
        keyMap,
    };
}
//# sourceMappingURL=modelProfiles.js.map