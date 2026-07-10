import type { RegzaDeviceConfig } from './settings';
export declare const MODEL_CUSTOM = "custom";
export declare const MODEL_55J10X = "55J10X";
export type RegzaModelProfileName = typeof MODEL_CUSTOM | typeof MODEL_55J10X;
export declare const MODEL_PROFILES: Record<string, Partial<RegzaDeviceConfig>>;
export declare function applyModelProfile(device: Partial<RegzaDeviceConfig>): Partial<RegzaDeviceConfig>;
