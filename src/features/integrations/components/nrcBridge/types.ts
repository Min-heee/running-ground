import type { RunSourceType } from '@/domain';
import type { DevicePlatform } from '../../sourceCatalog';

export type GuideStep = {
  title: string;
  description: string;
};

export type GuideSectionId = 'nrc' | 'mynb' | 'strava' | 'garmin';

export type GuideSection = {
  id: GuideSectionId;
  kicker: string;
  title: string;
  badge: string;
  statusLabel: string;
  statusValue: string;
  sourceStatusLabel: string;
  sourceStatusValue: string;
  bridgeStatusLabel: string;
  bridgeStatusValue: string;
  steps: GuideStep[];
  footnote?: string;
};

export type NrcBridgeGuideActionProps = {
  sectionId: GuideSectionId;
  platform: DevicePlatform;
  actionSourceType?: string | null;
  importing?: boolean;
  syncing?: boolean;
  appleHealthConnected: boolean;
  appleHealthReady: boolean;
  healthConnectConnected: boolean;
  healthConnectReady: boolean;
  nrcConnected: boolean;
  mynbConnected: boolean;
  stravaConnected: boolean;
  garminConnected: boolean;
  onConnectSource?: (sourceType: RunSourceType) => void;
  onImportDevice?: () => void;
  onSync?: () => void;
};
