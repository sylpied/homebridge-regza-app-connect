import { RemoteKeys } from './remoteKeys';
import type { RegzaDeviceConfig } from './settings';

export const MODEL_CUSTOM = 'custom';
export const MODEL_55J10X = '55J10X';

export type RegzaModelProfileName = typeof MODEL_CUSTOM | typeof MODEL_55J10X;

export const MODEL_PROFILES: Record<string, Partial<RegzaDeviceConfig>> = {
  [MODEL_55J10X]: {
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
    pollingInterval: 30,
    enableMutePowerProbe: true,
    powerProbeMode: 'operation',
    powerProbeInterval: 60,
    selectKeyMode: 'guideFirst',
    navigationTimeoutSeconds: 60,
    navigationPostSelectResetSeconds: 15,
    contextualRemoteArrows: true,
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

  // Explicit user configuration wins over profile defaults.
  return {
    ...profile,
    ...device,
  };
}
