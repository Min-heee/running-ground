import { memo, useCallback, useMemo, useState } from 'react';
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

type NrcBridgeGuideStatus = {
  appleHealthConnected: boolean;
  appleHealthReady: boolean;
  garminConnected: boolean;
  healthConnectConnected: boolean;
  healthConnectReady: boolean;
  mynbConnected: boolean;
  nrcConnected: boolean;
  stravaConnected: boolean;
};

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

const NrcBridgeGuideSectionRow = memo(function NrcBridgeGuideSectionRow({
  actionSourceType,
  expanded,
  importing,
  onConnectSource,
  onImportDevice,
  onSync,
  onToggleSection,
  platform,
  section,
  status,
  syncing,
}: {
  actionSourceType?: string | null;
  expanded: boolean;
  importing: boolean;
  onConnectSource?: (sourceType: RunSourceType) => void;
  onImportDevice?: () => void;
  onSync?: () => void;
  onToggleSection: (sectionId: GuideSectionId) => void;
  platform: DevicePlatform;
  section: ReturnType<typeof buildIosSections>[number];
  status: NrcBridgeGuideStatus;
  syncing: boolean;
}) {
  const handleToggle = useCallback(() => onToggleSection(section.id), [onToggleSection, section.id]);
  const actionContent = useMemo(() => (
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
  ), [
    actionSourceType,
    importing,
    onConnectSource,
    onImportDevice,
    onSync,
    platform,
    section.id,
    status,
    syncing,
  ]);

  return (
    <NrcBridgeGuideSection
      section={section}
      expanded={expanded}
      onToggle={handleToggle}
      actionContent={actionContent}
    />
  );
});

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
  const status = useMemo<NrcBridgeGuideStatus>(() => ({
    appleHealthConnected: Boolean(appleHealthSource?.connected),
    appleHealthReady,
    garminConnected: Boolean(garminSource?.connected),
    healthConnectConnected: Boolean(healthConnectSource?.connected),
    healthConnectReady,
    mynbConnected: Boolean(mynbSource?.connected),
    nrcConnected: Boolean(nrcSource?.connected),
    stravaConnected: Boolean(stravaSource?.connected),
  }), [
    appleHealthReady,
    appleHealthSource?.connected,
    garminSource?.connected,
    healthConnectReady,
    healthConnectSource?.connected,
    mynbSource?.connected,
    nrcSource?.connected,
    stravaSource?.connected,
  ]);
  const sections = useMemo(() => (platform === 'ios'
    ? buildIosSections(status)
    : platform === 'android'
      ? buildAndroidSections(status)
      : []), [platform, status]);
  const handleToggleSection = useCallback((sectionId: GuideSectionId) => {
    setOpenSectionId((current) => (current === sectionId ? null : sectionId));
  }, []);
  const sectionRows = useMemo(() => sections.map((section) => (
    <NrcBridgeGuideSectionRow
      key={section.id}
      section={section}
      expanded={openSectionId === section.id}
      onToggleSection={handleToggleSection}
      platform={platform}
      actionSourceType={actionSourceType}
      importing={importing}
      syncing={syncing}
      status={status}
      onConnectSource={onConnectSource}
      onImportDevice={onImportDevice}
      onSync={onSync}
    />
  )), [
    actionSourceType,
    handleToggleSection,
    importing,
    onConnectSource,
    onImportDevice,
    onSync,
    openSectionId,
    platform,
    sections,
    status,
    syncing,
  ]);

  if (sections.length === 0) {
    return null;
  }

  return (
    <View style={styles.group}>
      {sectionRows}
    </View>
  );
}
