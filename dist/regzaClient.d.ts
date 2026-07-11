import type { Logging } from 'homebridge';
import type { PowerMode } from './settings';
export type RegzaProtocol = 'http' | 'https';
export interface RegzaClientOptions {
    log: Logging;
    name: string;
    ip: string;
    username: string;
    password: string;
    port?: number;
    protocol?: RegzaProtocol;
    allowSelfSignedCertificate?: boolean;
    debugEnabled?: boolean;
    keyMap?: Record<string, string>;
    timeoutMs?: number;
    powerMode?: PowerMode;
    powerOnKey?: string;
    powerOffKey?: string;
    powerToggleKey?: string;
}
export interface RegzaPlaybackStatus {
    status: number;
    content_type: string;
    epg_info_current: {
        channel?: string;
        channel_name?: string;
    } | null;
}
export interface RegzaMuteStatus {
    status: number;
    mute: 'on' | 'off';
}
export declare class RegzaClient {
    private readonly options;
    private readonly protocol;
    private readonly port;
    private readonly keyMap;
    private readonly timeoutMs;
    private readonly powerMode;
    constructor(options: RegzaClientOptions);
    sendKey(key: string): Promise<string>;
    powerOn(): Promise<void>;
    powerOff(): Promise<void>;
    powerToggle(): Promise<void>;
    volumeUp(): Promise<void>;
    volumeDown(): Promise<void>;
    mute(): Promise<void>;
    channelUp(): Promise<void>;
    channelDown(): Promise<void>;
    getPlaybackStatus(): Promise<RegzaPlaybackStatus>;
    getMuteStatus(): Promise<RegzaMuteStatus>;
    probePowerWithMute(): Promise<boolean>;
    private getJson;
    private requestWithDigest;
    private request;
    private parseDigestChallenge;
    private createDigestAuthorization;
    private md5;
    private sleep;
    private escapeDigestValue;
    private resolveKey;
    private describeError;
}
