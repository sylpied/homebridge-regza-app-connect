"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegzaClient = void 0;
const digest_fetch_1 = __importDefault(require("digest-fetch"));
const node_http_1 = __importDefault(require("node:http"));
const node_https_1 = __importDefault(require("node:https"));
const DEFAULT_KEY_MAP = {
    power: '40BF12',
    powerToggle: '40BF12',
    mute: '40BF0F',
    // These are best-effort REGZA key codes. They can be overridden with keyMap in config.
    volumeUp: '40BF1B',
    volumeDown: '40BF1F',
    channelUp: '40BF1A',
    channelDown: '40BF1E',
    up: '40BF73',
    down: '40BF74',
    left: '40BF75',
    right: '40BF76',
    enter: '40BE2D',
    return: '40BF0D',
    display: '40BF0E',
};
class RegzaClient {
    options;
    httpClient;
    agent;
    protocol;
    port;
    keyMap;
    constructor(options) {
        this.options = options;
        this.protocol = options.protocol ?? 'https';
        this.port = options.port ?? (this.protocol === 'https' ? 4430 : 80);
        this.keyMap = { ...DEFAULT_KEY_MAP, ...(options.keyMap ?? {}) };
        this.httpClient = new digest_fetch_1.default(options.username, options.password);
        this.agent = this.protocol === 'https'
            ? new node_https_1.default.Agent({ rejectUnauthorized: options.allowSelfSignedCertificate === false })
            : new node_http_1.default.Agent();
    }
    async sendKey(key) {
        const mappedKey = this.resolveKey(key);
        const encodedKey = encodeURIComponent(mappedKey);
        const url = `${this.protocol}://${this.options.ip}:${this.port}/remote/remote.htm?key=${encodedKey}`;
        if (this.options.debugEnabled) {
            this.options.log.info(`[${this.options.name}] REGZA request: GET ${url} (sourceKey=${key}, digest username=${this.options.username ? 'configured' : 'missing'}, password=${this.options.password ? 'configured' : 'missing'})`);
        }
        else {
            this.options.log.debug(`[${this.options.name}] REGZA request key=${key} mappedKey=${mappedKey}`);
        }
        try {
            const response = await this.httpClient.fetch(url, {
                method: 'GET',
                agent: this.agent,
            });
            const body = (await response.text()).trim();
            if (this.options.debugEnabled) {
                this.options.log.info(`[${this.options.name}] REGZA response: key=${key}, mappedKey=${mappedKey}, status=${response.status} ${response.statusText}, body=${JSON.stringify(body)}`);
            }
            if (response.status === 401) {
                this.options.log.warn(`[${this.options.name}] REGZA authentication failed. Check App Connect username/password on the TV and in Homebridge config.`);
                return body;
            }
            if (!response.ok) {
                this.options.log.warn(`[${this.options.name}] REGZA command failed: key=${key}, mappedKey=${mappedKey}, status=${response.status} ${response.statusText}, body=${JSON.stringify(body)}`);
                return body;
            }
            // REGZA remote.htm returns text/plain: 0=success, 1/2=not executed/invalid depending on model.
            if (body !== '0') {
                this.options.log.debug(`[${this.options.name}] REGZA returned non-success body for key=${key}, mappedKey=${mappedKey}: ${JSON.stringify(body)}`);
            }
            return body;
        }
        catch (error) {
            this.options.log.warn(`[${this.options.name}] REGZA command error: key=${key}, mappedKey=${mappedKey}, ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    }
    async powerToggle() {
        await this.sendKey('power');
    }
    async volumeUp() {
        await this.sendKey('volumeUp');
    }
    async volumeDown() {
        await this.sendKey('volumeDown');
    }
    async mute() {
        await this.sendKey('mute');
    }
    async channelUp() {
        await this.sendKey('channelUp');
    }
    async channelDown() {
        await this.sendKey('channelDown');
    }
    resolveKey(key) {
        return this.keyMap[key] ?? this.keyMap[key.toLowerCase()] ?? key;
    }
}
exports.RegzaClient = RegzaClient;
//# sourceMappingURL=regzaClient.js.map