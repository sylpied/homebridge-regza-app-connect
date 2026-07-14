import type { API, DynamicPlatformPlugin, Logging, PlatformAccessory } from 'homebridge';
import { RegzaDeviceConfig, RegzaInputConfig, RegzaPlatformConfig, SelectKeyMode } from './settings';
export declare function getDeviceIdentity(device: Pick<RegzaDeviceConfig, 'ip' | 'mac' | 'deviceType'>): string;
export declare function migrateSelectKeyMode(model: string | undefined, mode: SelectKeyMode | undefined): SelectKeyMode | undefined;
export declare function getEffectiveModel(device: Pick<RegzaDeviceConfig, 'model' | 'deviceType'>): string;
export declare function migrateDefaultInputNames(model: string, inputs: RegzaInputConfig[] | undefined): RegzaInputConfig[] | undefined;
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
