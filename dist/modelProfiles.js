"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODEL_PROFILES = exports.MODEL_55J10X = exports.MODEL_CUSTOM = void 0;
exports.applyModelProfile = applyModelProfile;
const remoteKeys_1 = require("./remoteKeys");
exports.MODEL_CUSTOM = 'custom';
exports.MODEL_55J10X = '55J10X';
exports.MODEL_PROFILES = {
    [exports.MODEL_55J10X]: {
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
        pollingInterval: 30,
        enableMutePowerProbe: true,
        powerProbeMode: 'operation',
        powerProbeInterval: 60,
        selectKeyMode: 'guideFirst',
        navigationTimeoutSeconds: 60,
        navigationPostSelectResetSeconds: 15,
        contextualRemoteArrows: true,
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
    // Explicit user configuration wins over profile defaults.
    return {
        ...profile,
        ...device,
    };
}
//# sourceMappingURL=modelProfiles.js.map