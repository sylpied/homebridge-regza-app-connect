import type { PlatformConfig } from 'homebridge';
import { RemoteKeys } from './remoteKeys';

export const PLATFORM_NAME = 'RegzaAppConnect';
export const PLUGIN_NAME = 'homebridge-regza-app-connect';

export interface RegzaInputConfig {
  name: string;
  key: string;
  identifier?: number;
}

export type PowerMode = 'discrete' | 'toggle';
export type SelectKeyMode = 'normal' | 'guideFirst' | 'menuFirst' | 'quickFirst';

export interface RegzaDeviceConfig {
  name: string;
  ip: string;
  mac?: string;
  username: string;
  password: string;
  model?: string;
  port?: number;
  protocol?: 'http' | 'https';
  allowSelfSignedCertificate?: boolean;
  powerMode?: PowerMode;
  powerOnKey?: string;
  powerOffKey?: string;
  powerToggleKey?: string;
  /** @deprecated Use powerToggleKey instead. Kept for v0.1.x config compatibility. */
  powerKey?: string;
  keyMap?: Record<string, string>;
  enableWakeOnLan?: boolean;
  wakeOnLanPort?: number;
  wakeOnLanAddress?: string;
  powerOnDelaySeconds?: number;
  requestTimeoutMs?: number;
  pollingInterval?: number;
  enableMutePowerProbe?: boolean;
  powerProbeInterval?: number;
  selectKeyMode?: SelectKeyMode;
  navigationTimeoutSeconds?: number;
  navigationPostSelectResetSeconds?: number;
  contextualRemoteArrows?: boolean;
  inputs?: RegzaInputConfig[];
}

export interface RegzaPlatformConfig extends PlatformConfig {
  devices?: RegzaDeviceConfig[];
  tvs?: RegzaDeviceConfig[];
  debug?: boolean;
}

export const DEFAULT_INPUTS: RegzaInputConfig[] = [
  { name: '地デジ', key: RemoteKeys.TERRESTRIAL, identifier: 1 },
  { name: 'BS', key: RemoteKeys.BS, identifier: 2 },
  { name: 'CS', key: RemoteKeys.CS, identifier: 3 },
  { name: 'HDMI（次のアクティブ入力）', key: RemoteKeys.HDMI_NEXT_ACTIVE, identifier: 4 },
];
