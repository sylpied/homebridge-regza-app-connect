import type { Logging } from 'homebridge';
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
}
export declare class RegzaClient {
    private readonly options;
    private readonly httpClient;
    private readonly agent;
    private readonly protocol;
    private readonly port;
    private readonly keyMap;
    constructor(options: RegzaClientOptions);
    sendKey(key: string): Promise<string>;
    powerToggle(): Promise<void>;
    volumeUp(): Promise<void>;
    volumeDown(): Promise<void>;
    mute(): Promise<void>;
    channelUp(): Promise<void>;
    channelDown(): Promise<void>;
    private resolveKey;
}
