import type { PlatformConfig } from 'homebridge';
export declare const PLATFORM_NAME = "RegzaAppConnect";
export declare const PLUGIN_NAME = "homebridge-regza-app-connect";
export interface RegzaInputConfig {
    name: string;
    key: string;
    identifier?: number;
}
export interface RegzaDeviceConfig {
    name: string;
    ip: string;
    mac?: string;
    username: string;
    password: string;
    port?: number;
    protocol?: 'http' | 'https';
    allowSelfSignedCertificate?: boolean;
    powerKey?: string;
    keyMap?: Record<string, string>;
    enableWakeOnLan?: boolean;
    wakeOnLanPort?: number;
    wakeOnLanAddress?: string;
    powerOnDelaySeconds?: number;
    pollingInterval?: number;
    inputs?: RegzaInputConfig[];
}
export interface RegzaPlatformConfig extends PlatformConfig {
    devices?: RegzaDeviceConfig[];
    tvs?: RegzaDeviceConfig[];
    debug?: boolean;
}
export declare const DEFAULT_INPUTS: RegzaInputConfig[];
