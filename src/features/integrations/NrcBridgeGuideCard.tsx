import { useState } from 'react';
import { View } from 'react-native';
import type { ConnectedSource, RunSourceType } from '@/domain';
import { NrcBridgeGuideActions } from './components/nrcBridge/NrcBridgeGuideActions';
import {
  NrcBridgeGuideSection,
  nrcBridgeGuideSectionStyles as styles,
} from './components/nrcBridge/NrcBridgeGuideSection';
import {
  buildAndroidSections,
  buildIosSections,
} from './components/nrcBridge/nrcBridgeGuideSections';
import type { GuideSectionId } from './components/nrcBridge/types';
import {
  DevicePlatform,
  getCurrentDevicePlatform,
  getSourceByType,
} from './sourceCatalog';

type NrcBridgeGuideCardProps = {
  sources: ConnectedSource[];
  platform?: DevicePlatform;
  actionSourceType?: string | null;
  syncing?: boolean;
  importing?: boolean;
  nativeHealthReady?: boolean;
  onConnectSource?: (sourceType: RunSourceType) => void;
  onImportDevice?: () => void;
  onSync?: () => void;
};

export function NrcBridgeGuideCard({
  sources,
  platform = getCurrentDevicePlatform(),
  actionSourceType,
  syncing = false,
  importing = false,
  nativeHealthReady = false,
  onConnectSource,
  onImportDevice,
  onSync,
}: NrcBridgeGuideCardProps) {
  const [openSectionId, setOpenSectionId] = useState<GuideSectionId | null>('nrc');
  const nrcSource = getSourceByType(sources, 'nrc');
  const mynbSource = getSourceByType(sources, 'mynb');
  const appleHealthSource = getSourceByType(sources, 'apple_health');
  const healthConnectSource = getSourceByType(sources, 'health_connect');
  const stravaSource = getSourceByType(sources, 'strava');
  const garminSource = getSourceByType(sources, 'garmin');
  const appleHealthReady = Boolean(appleHealthSource?.connected) && nativeHealthReady;
  const healthConnectReady = Boolean(healthConnectSource?.connected) && nativeHealthReady;
  const status = {
    appleHealthConnected: Boolean(appleHealthSource?.connected),
    appleHealthReady,
    garminConnected: Boolean(garminSource?.connected),
    healthConnectConnected: Boolean(healthConnectSource?.connected),
    healthConnectReady,
    mynbConnected: Boolean(mynbSource?.connected),
    nrcConnected: Boolean(nrcSource?.connected),
    stravaConnected: Boolean(stravaSource?.connected),
  };
  const sections = platform === 'ios'
    ? buildIosSections(status)
    : platform === 'android'
      ? buildAndroidSections(status)
      : [];

  if (sections.length === 0) {
    return null;
  }

  return (
    <View style={styles.group}>
      {sections.map((section) => {
        const expanded = openSectionId === section.id;

        return (
          <NrcBridgeGuideSection
            key={section.id}
            section={section}
            expanded={expanded}
            onToggle={() => setOpenSectionId((current) => (current === section.id ? null : section.id))}
            actionContent={(
              <NrcBridgeGuideActions
                sectionId={section.id}
                platform={platform}
                actionSourceType={actionSourceType}
                importing={importing}
                syncing={syncing}
                {...status}
                onConnectSource={onConnectSource}
                onImportDevice={onImportDevice}
                onSync={onSync}
              />
            )}
          />
        );
      })}
    </View>
  );
}
