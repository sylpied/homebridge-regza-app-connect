import { RemoteKeys } from './remoteKeys';
import type { RegzaDeviceConfig } from './settings';

export const MODEL_CUSTOM = 'custom';
export const MODEL_55J10X = '55J10X';
export const MODEL_DBR_M590 = 'DBR-M590';

export type RegzaModelProfileName = typeof MODEL_CUSTOM | typeof MODEL_55J10X | typeof MODEL_DBR_M590;

export const MODEL_PROFILES: Record<string, Partial<RegzaDeviceConfig>> = {
  [MODEL_55J10X]: {
    deviceType: 'tv',
    publishMode: 'external',
    protocol: 'https',
    port: 4430,
    allowSelfSignedCertificate: true,
    powerMode: 'discrete',
    powerOnKey: RemoteKeys.POWER_ON,
    powerOffKey: RemoteKeys.POWER_OFF,
    powerToggleKey: RemoteKeys.POWER_TOGGLE,
    enableWakeOnLan: false,
    powerOnDelaySeconds: 2,
    requestTimeoutMs: 5000,
    pollingInterval: 120,
    enableMutePowerProbe: true,
    powerProbeMode: 'operation',
    powerProbeInterval: 60,
    operationPowerOnThresholdSeconds: 30,
    stalePowerProbeHours: 8,
    operationCommandDelayMs: 250,
    selectKeyMode: 'guideFirst',
    navigationTimeoutSeconds: 60,
    navigationPostSelectResetSeconds: 15,
    contextualRemoteArrows: true,
    remoteResponseMode: 'zero',
    supportsV2Status: true,
    supportsSsdpRendererStatus: true,
    supportsVolumeControl: true,
  },
  [MODEL_DBR_M590]: {
    deviceType: 'recorder',
    // Apple Home Remote only exposes one Television service per bridge.
    // Publish recorders independently so they appear in its device picker.
    publishMode: 'external',
    protocol: 'http',
    port: 80,
    allowSelfSignedCertificate: false,
    powerMode: 'toggle',
    powerToggleKey: '12',
    enableWakeOnLan: false,
    requestTimeoutMs: 5000,
    powerProbeMode: 'optimistic',
    enableMutePowerProbe: false,
    selectKeyMode: 'menuFirst',
    contextualRemoteArrows: false,
    remoteResponseMode: 'httpStatus',
    supportsV2Status: false,
    // The recorder has no volume control. When a TV is configured alongside
    // it, the accessory forwards HomeKit speaker controls to that TV.
    supportsVolumeControl: false,
    keyMap: {
      power: '12', powerToggle: '12',
      channelUp: '1e', channelDown: '1f',
      up: 'c0', down: 'c8', left: 'cc', right: 'c4',
      enter: '44', return: '4b', exit: '60', display: '5a',
      guide: 'b5', menu: '46', quick: '45',
      blue: '29',
      terrestrial: 'bd', bs: 'be', cs: 'bf',
      play: '13', pause: '17', stop: '16',
      rewind: '9a', fastForward: '98', previous: '84', next: '80',
      record: '15', recordingList: '6d',
    },
    inputs: [
      { name: '地デジ', key: 'bd', identifier: 1 },
      { name: 'BS', key: 'be', identifier: 2 },
      { name: 'CS', key: 'bf', identifier: 3 },
    ],
  },
};

export function applyModelProfile(device: Partial<RegzaDeviceConfig>): Partial<RegzaDeviceConfig> {
  const model = device.model;
  if (!model || model === MODEL_CUSTOM) {
    return device;
  }

  const profile = MODEL_PROFILES[model];
  if (!profile) {
    return device;
  }

  // Explicit user configuration wins over ordinary profile defaults. For a
  // verified recorder profile, however, its remote map must win over stale TV
  // mappings left by early builds. Use the custom model for a custom key map.
  const keyMap = model === MODEL_DBR_M590
    ? { ...(device.keyMap ?? {}), ...(profile.keyMap ?? {}) }
    : { ...(profile.keyMap ?? {}), ...(device.keyMap ?? {}) };
  return {
    ...profile,
    ...device,
    keyMap,
  };
}
