import type { PlatformAccessory } from 'homebridge';
import { RegzaDeviceConfig } from './settings';
import type { RegzaPlatform } from './platform';
export declare class RegzaTvAccessory {
    private readonly platform;
    private readonly accessory;
    private readonly device;
    private readonly client;
    private readonly tvService;
    private readonly speakerService;
    private active;
    private currentInput;
    constructor(platform: RegzaPlatform, accessory: PlatformAccessory, device: RegzaDeviceConfig);
    private configureTelevision;
    private configureSpeaker;
    private configureInputs;
    private setActive;
    private setInput;
    private handleRemoteKey;
    private getInputs;
    private wake;
    private sleep;
}
