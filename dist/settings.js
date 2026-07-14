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
    { name: 'HDMI Next Active', key: remoteKeys_1.RemoteKeys.HDMI_NEXT_ACTIVE, identifier: 4 },
];
//# sourceMappingURL=settings.js.map