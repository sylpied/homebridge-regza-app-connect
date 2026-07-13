import type { API, DynamicPlatformPlugin, Logging, PlatformAccessory } from 'homebridge';
import { RegzaDeviceConfig, RegzaPlatformConfig } from './settings';
export declare function getDeviceIdentity(device: Pick<RegzaDeviceConfig, 'ip' | 'mac'>): string;
export declare class RegzaPlatform implements DynamicPlatformPlugin {
    readonly log: Logging;
    readonly config: RegzaPlatformConfig;
    readonly api: API;
    readonly Service: typeof import("homebridge").Service;
    readonly Characteristic: typeof import("homebridge").Characteristic;
    private readonly cachedAccessories;
    constructor(log: Logging, config: RegzaPlatformConfig, api: API);
    configureAccessory(accessory: PlatformAccessory): void;
    private discoverDevices;
    private logDeviceConfig;
    private normalizeDeviceConfig;
    private getDevices;
    private isValidDevice;
}
