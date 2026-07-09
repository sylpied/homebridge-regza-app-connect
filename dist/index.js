"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const settings_1 = require("./settings");
const platform_1 = require("./platform");
exports.default = (api) => {
    api.registerPlatform(settings_1.PLATFORM_NAME, platform_1.RegzaPlatform);
};
//# sourceMappingURL=index.js.map