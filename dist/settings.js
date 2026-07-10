"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_INPUTS = exports.PLUGIN_NAME = exports.PLATFORM_NAME = void 0;
const remoteKeys_1 = require("./remoteKeys");
exports.PLATFORM_NAME = 'RegzaAppConnect';
exports.PLUGIN_NAME = 'homebridge-regza-app-connect';
exports.DEFAULT_INPUTS = [
    { name: '地デジ', key: remoteKeys_1.RemoteKeys.TERRESTRIAL, identifier: 1 },
    { name: 'BS', key: remoteKeys_1.RemoteKeys.BS, identifier: 2 },
    { name: 'CS', key: remoteKeys_1.RemoteKeys.CS, identifier: 3 },
    { name: 'HDMI 1', key: remoteKeys_1.RemoteKeys.HDMI_1, identifier: 4 },
    { name: 'HDMI 2', key: remoteKeys_1.RemoteKeys.HDMI_2, identifier: 5 },
    { name: 'HDMI 3', key: remoteKeys_1.RemoteKeys.HDMI_3, identifier: 6 },
    { name: 'HDMI 4', key: remoteKeys_1.RemoteKeys.HDMI_4, identifier: 7 },
];
//# sourceMappingURL=settings.js.map