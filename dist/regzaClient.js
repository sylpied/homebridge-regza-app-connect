"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegzaClient = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_http_1 = __importDefault(require("node:http"));
const node_https_1 = __importDefault(require("node:https"));
const remoteKeys_1 = require("./remoteKeys");
const DEFAULT_KEY_MAP = {
    power: remoteKeys_1.RemoteKeys.POWER_TOGGLE,
    powerOn: remoteKeys_1.RemoteKeys.POWER_ON,
    powerOff: remoteKeys_1.RemoteKeys.POWER_OFF,
    powerToggle: remoteKeys_1.RemoteKeys.POWER_TOGGLE,
    mute: remoteKeys_1.RemoteKeys.MUTE,
    // Verified REGZA remote key codes. They can be overridden with keyMap in config.
    volumeUp: remoteKeys_1.RemoteKeys.VOLUME_UP,
    volumeDown: remoteKeys_1.RemoteKeys.VOLUME_DOWN,
    channelUp: remoteKeys_1.RemoteKeys.CHANNEL_UP,
    channelDown: remoteKeys_1.RemoteKeys.CHANNEL_DOWN,
    up: remoteKeys_1.RemoteKeys.UP,
    down: remoteKeys_1.RemoteKeys.DOWN,
    left: remoteKeys_1.RemoteKeys.LEFT,
    right: remoteKeys_1.RemoteKeys.RIGHT,
    enter: remoteKeys_1.RemoteKeys.ENTER,
    return: remoteKeys_1.RemoteKeys.RETURN,
    display: remoteKeys_1.RemoteKeys.DISPLAY,
    guide: remoteKeys_1.RemoteKeys.GUIDE,
    menu: remoteKeys_1.RemoteKeys.MENU,
    quick: remoteKeys_1.RemoteKeys.QUICK,
    exit: remoteKeys_1.RemoteKeys.EXIT,
    terrestrial: remoteKeys_1.RemoteKeys.TERRESTRIAL,
    bs: remoteKeys_1.RemoteKeys.BS,
    cs: remoteKeys_1.RemoteKeys.CS,
};
class RegzaClient {
    options;
    protocol;
    port;
    keyMap;
    timeoutMs;
    powerMode;
    constructor(options) {
        this.options = options;
        this.protocol = options.protocol ?? 'https';
        this.port = options.port ?? (this.protocol === 'https' ? 4430 : 80);
        this.keyMap = {
            ...DEFAULT_KEY_MAP,
            ...(options.powerOnKey ? { powerOn: options.powerOnKey } : {}),
            ...(options.powerOffKey ? { powerOff: options.powerOffKey } : {}),
            ...(options.powerToggleKey ? { power: options.powerToggleKey, powerToggle: options.powerToggleKey } : {}),
            ...(options.keyMap ?? {}),
        };
        this.timeoutMs = options.timeoutMs ?? 5000;
        this.powerMode = options.powerMode ?? 'discrete';
    }
    async sendKey(key) {
        const mappedKey = this.resolveKey(key);
        const encodedKey = encodeURIComponent(mappedKey);
        const path = `/remote/remote.htm?key=${encodedKey}`;
        const url = `${this.protocol}://${this.options.ip}:${this.port}${path}`;
        if (this.options.debugEnabled) {
            this.options.log.info(`[${this.options.name}] REGZA request: GET ${url} (sourceKey=${key}, digest username=${this.options.username ? 'configured' : 'missing'}, password=${this.options.password ? 'configured' : 'missing'}, allowSelfSignedCertificate=${this.options.allowSelfSignedCertificate !== false})`);
        }
        else {
            this.options.log.debug(`[${this.options.name}] REGZA request key=${key} mappedKey=${mappedKey}`);
        }
        try {
            const response = await this.requestWithDigest(path);
            const body = response.body.trim();
            if (this.options.debugEnabled) {
                this.options.log.info(`[${this.options.name}] REGZA response: key=${key}, mappedKey=${mappedKey}, status=${response.statusCode} ${response.statusMessage}, body=${JSON.stringify(body)}`);
            }
            if (response.statusCode === 401) {
                throw new Error('REGZA authentication failed. Check the App Connect username and password.');
            }
            if (response.statusCode < 200 || response.statusCode >= 300) {
                throw new Error(`REGZA returned HTTP ${response.statusCode} ${response.statusMessage}, body=${JSON.stringify(body)}`);
            }
            // REGZA remote.htm returns text/plain: 0=success, 1/2=not executed/invalid depending on model.
            if (body !== '0') {
                throw new Error(`REGZA did not execute key=${mappedKey}; response body=${JSON.stringify(body)}`);
            }
            return body;
        }
        catch (error) {
            this.options.log.warn(`[${this.options.name}] REGZA command error: key=${key}, mappedKey=${mappedKey}, ${this.describeError(error)}`);
            throw error;
        }
    }
    async powerOn() {
        await this.sendKey(this.powerMode === 'discrete' ? 'powerOn' : 'powerToggle');
    }
    async powerOff() {
        await this.sendKey(this.powerMode === 'discrete' ? 'powerOff' : 'powerToggle');
    }
    async powerToggle() {
        await this.sendKey('powerToggle');
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
    async getPlaybackStatus() {
        return this.getJson('/v2/remote/play/status');
    }
    async getMuteStatus() {
        return this.getJson('/v2/remote/status/mute');
    }
    async probePowerWithMute(delayMs = 750) {
        const before = await this.getMuteStatus();
        if (before.status !== 0) {
            throw new Error(`REGZA mute status failed before power probe: status=${before.status}`);
        }
        await this.mute();
        let restorationRequired = true;
        try {
            await this.sleep(delayMs);
            const after = await this.getMuteStatus();
            if (after.status !== 0) {
                throw new Error(`REGZA mute status failed during power probe: status=${after.status}`);
            }
            const changed = before.mute !== after.mute;
            // Always send the second toggle. Even if the status endpoint still reports
            // the old value, the first command may have taken effect slightly later.
            await this.mute();
            restorationRequired = false;
            if (!changed) {
                return false;
            }
            await this.sleep(delayMs);
            const restored = await this.getMuteStatus();
            if (restored.status !== 0 || restored.mute !== before.mute) {
                throw new Error(`REGZA mute state was not restored after power probe: before=${before.mute}, restored=${restored.mute}`);
            }
            return true;
        }
        catch (error) {
            if (restorationRequired) {
                try {
                    await this.mute();
                }
                catch (restoreError) {
                    throw new Error(`REGZA power probe failed and mute restoration also failed: ` +
                        `${this.describeError(error)}; restore=${this.describeError(restoreError)}`);
                }
            }
            throw error;
        }
    }
    async getJson(path) {
        const response = await this.requestWithDigest(path);
        if (response.statusCode === 401) {
            throw new Error('REGZA authentication failed. Check the App Connect username and password.');
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
            throw new Error(`REGZA returned HTTP ${response.statusCode} ${response.statusMessage}`);
        }
        try {
            return JSON.parse(response.body);
        }
        catch (error) {
            throw new Error(`REGZA returned invalid JSON for ${path}: ${this.describeError(error)}`);
        }
    }
    async requestWithDigest(path) {
        const first = await this.request(path);
        if (first.statusCode !== 401) {
            return first;
        }
        const authenticateHeader = first.headers['www-authenticate'];
        const header = Array.isArray(authenticateHeader) ? authenticateHeader[0] : authenticateHeader;
        if (!header) {
            throw new Error('Digest authentication challenge was not returned by REGZA');
        }
        const challenge = this.parseDigestChallenge(header);
        const authorization = this.createDigestAuthorization(path, challenge);
        return this.request(path, authorization);
    }
    request(path, authorization) {
        const useHttps = this.protocol === 'https';
        const transport = useHttps ? node_https_1.default : node_http_1.default;
        const headers = {
            'Accept': '*/*',
            'Connection': 'close',
            'User-Agent': 'homebridge-regza-app-connect/0.7.3',
        };
        if (authorization) {
            headers.Authorization = authorization;
        }
        return new Promise((resolve, reject) => {
            const request = transport.request({
                host: this.options.ip,
                port: this.port,
                path,
                method: 'GET',
                headers,
                timeout: this.timeoutMs,
                rejectUnauthorized: useHttps ? this.options.allowSelfSignedCertificate === false : undefined,
            }, response => {
                response.setEncoding('utf8');
                let body = '';
                response.on('data', chunk => {
                    body += chunk;
                });
                response.on('end', () => {
                    resolve({
                        statusCode: response.statusCode ?? 0,
                        statusMessage: response.statusMessage ?? '',
                        headers: response.headers,
                        body,
                    });
                });
            });
            request.on('timeout', () => {
                request.destroy(new Error(`REGZA request timed out after ${this.timeoutMs}ms`));
            });
            request.on('error', reject);
            request.end();
        });
    }
    parseDigestChallenge(header) {
        if (!header.toLowerCase().startsWith('digest')) {
            throw new Error(`Unsupported WWW-Authenticate header: ${header}`);
        }
        const values = {};
        const regex = /([a-zA-Z0-9_-]+)=(?:"([^"]*)"|([^,\s]+))/g;
        let match;
        while ((match = regex.exec(header)) !== null) {
            values[match[1].toLowerCase()] = match[2] ?? match[3] ?? '';
        }
        if (!values.realm || !values.nonce) {
            throw new Error(`Incomplete Digest challenge: ${header}`);
        }
        return {
            realm: values.realm,
            nonce: values.nonce,
            qop: values.qop,
            algorithm: values.algorithm,
            opaque: values.opaque,
        };
    }
    createDigestAuthorization(path, challenge) {
        const algorithm = (challenge.algorithm ?? 'MD5').toUpperCase();
        if (algorithm !== 'MD5') {
            throw new Error(`Unsupported Digest algorithm from REGZA: ${algorithm}`);
        }
        const qop = challenge.qop?.split(',').map(item => item.trim()).includes('auth') ? 'auth' : undefined;
        const method = 'GET';
        const nc = '00000001';
        const cnonce = node_crypto_1.default.randomBytes(8).toString('hex');
        const ha1 = this.md5(`${this.options.username}:${challenge.realm}:${this.options.password}`);
        const ha2 = this.md5(`${method}:${path}`);
        const response = qop
            ? this.md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
            : this.md5(`${ha1}:${challenge.nonce}:${ha2}`);
        const parts = [
            `username="${this.escapeDigestValue(this.options.username)}"`,
            `realm="${this.escapeDigestValue(challenge.realm)}"`,
            `nonce="${this.escapeDigestValue(challenge.nonce)}"`,
            `uri="${this.escapeDigestValue(path)}"`,
            `response="${response}"`,
            `algorithm=${algorithm}`,
        ];
        if (challenge.opaque) {
            parts.push(`opaque="${this.escapeDigestValue(challenge.opaque)}"`);
        }
        if (qop) {
            parts.push(`qop=${qop}`);
            parts.push(`nc=${nc}`);
            parts.push(`cnonce="${cnonce}"`);
        }
        return `Digest ${parts.join(', ')}`;
    }
    md5(value) {
        return node_crypto_1.default.createHash('md5').update(value).digest('hex');
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    escapeDigestValue(value) {
        return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }
    resolveKey(key) {
        return this.keyMap[key] ?? this.keyMap[key.toLowerCase()] ?? key;
    }
    describeError(error) {
        if (!(error instanceof Error)) {
            return String(error);
        }
        const errorWithCode = error;
        const details = [error.name, error.message];
        if (errorWithCode.code) {
            details.push(`code=${errorWithCode.code}`);
        }
        if (errorWithCode.syscall) {
            details.push(`syscall=${errorWithCode.syscall}`);
        }
        return details.join(', ');
    }
}
exports.RegzaClient = RegzaClient;
//# sourceMappingURL=regzaClient.js.map