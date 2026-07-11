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
    private muted;
    private currentInput;
    private powerProbeRunning;
    constructor(platform: RegzaPlatform, accessory: PlatformAccessory, device: RegzaDeviceConfig);
    private configureTelevision;
    private configureSpeaker;
    private configureInputs;
    private setActive;
    private setInput;
    private handleRemoteKey;
    private getInputs;
    private startStatusPolling;
    private startPowerProbing;
    private probePowerStatus;
    private pollStatus;
    private wake;
    private sleep;
}
