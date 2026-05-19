import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { getCurrentDevicePlatform, getSourceMetadata } from '@/features/integrations/sourceCatalog';
import type { RunSourceType } from '@/domain';
import type { IntegrationStatusResponse } from '@/lib/api/types';
import { colors } from '@/theme/tokens';

type IntegrationSource = IntegrationStatusResponse['sources'][number];
type DevicePlatform = ReturnType<typeof getCurrentDevicePlatform>;

type ConnectedSourcesCardProps = {
  sources: IntegrationSource[];
  platform: DevicePlatform;
  actionSourceType: string | null;
  onDisconnectSource: (sourceType: RunSourceType) => Promise<void> | void;
};

export function ConnectedSourcesCard({
  sources,
  platform,
  actionSourceType,
  onDisconnectSource,
}: ConnectedSourcesCardProps) {
  const sourceRows = useMemo(() => sources.map((source) => (
    <ConnectedSourceRow
      key={source.sourceType}
      source={source}
      platform={platform}
      actionSourceType={actionSourceType}
      onDisconnectSource={onDisconnectSource}
    />
  )), [actionSourceType, onDisconnectSource, platform, sources]);

  return (
    <Card>
      <Text style={styles.sectionTitle}>지금 연결된 소스</Text>
      <Text style={styles.helperText}>자동 기록 소스는 한 번에 1개만 연결돼. 새로 연결하면 이전 자동 연동은 자동으로 해제돼.</Text>
      {sourceRows}
      {sources.length === 0 ? <Text style={styles.emptyText}>아직 연결된 기록 소스가 없어.</Text> : null}
    </Card>
  );
}

const ConnectedSourceRow = memo(function ConnectedSourceRow({
  actionSourceType,
  onDisconnectSource,
  platform,
  source,
}: {
  actionSourceType: string | null;
  onDisconnectSource: (sourceType: RunSourceType) => Promise<void> | void;
  platform: DevicePlatform;
  source: IntegrationSource;
}) {
  const metadata = useMemo(() => getSourceMetadata(source.sourceType, platform), [platform, source.sourceType]);
  const isBusy = actionSourceType === source.sourceType;
  const handleDisconnect = useCallback(() => {
    void onDisconnectSource(source.sourceType);
  }, [onDisconnectSource, source.sourceType]);

  return (
    <View style={styles.row}>
      <View style={styles.meta}>
        <Text style={styles.name}>{source.displayName}</Text>
        <Text style={styles.detail}>마지막 동기화 {source.lastSyncedAt ?? '아직 없음'}</Text>
        {source.pendingImportCount ? <Text style={styles.pendingText}>대기 중인 가져오기 {source.pendingImportCount}개</Text> : null}
        <Text style={styles.platform}>{metadata.shortDescription}</Text>
      </View>
      <Pressable
        style={[styles.actionButton, styles.connectedBadge, isBusy && styles.actionButtonDisabled]}
        disabled={isBusy}
        onPress={handleDisconnect}
      >
        <Text style={styles.connectedBadgeText}>
          {isBusy ? '처리 중...' : '해제'}
        </Text>
      </Pressable>
    </View>
  );
});

type AvailableSourcesCardProps = {
  sources: IntegrationSource[];
  platform: DevicePlatform;
  actionSourceType: string | null;
  onConnectSource: (sourceType: RunSourceType) => Promise<void> | void;
};

export function AvailableSourcesCard({
  sources,
  platform,
  actionSourceType,
  onConnectSource,
}: AvailableSourcesCardProps) {
  const sourceRows = useMemo(() => sources.map((source) => (
    <AvailableSourceRow
      key={source.sourceType}
      source={source}
      platform={platform}
      actionSourceType={actionSourceType}
      onConnectSource={onConnectSource}
    />
  )), [actionSourceType, onConnectSource, platform, sources]);

  return (
    <Card>
      <Text style={styles.sectionTitle}>추가로 붙일 수 있는 소스</Text>
      {sourceRows}
      {sources.length === 0 ? <Text style={styles.emptyText}>지금 바로 추가로 붙일 확장 소스가 없어.</Text> : null}
    </Card>
  );
}

const AvailableSourceRow = memo(function AvailableSourceRow({
  actionSourceType,
  onConnectSource,
  platform,
  source,
}: {
  actionSourceType: string | null;
  onConnectSource: (sourceType: RunSourceType) => Promise<void> | void;
  platform: DevicePlatform;
  source: IntegrationSource;
}) {
  const metadata = useMemo(() => getSourceMetadata(source.sourceType, platform), [platform, source.sourceType]);
  const isBusy = actionSourceType === source.sourceType;
  const handleConnect = useCallback(() => {
    void onConnectSource(source.sourceType);
  }, [onConnectSource, source.sourceType]);

  return (
    <View style={styles.row}>
      <View style={styles.meta}>
        <Text style={styles.name}>{source.displayName}</Text>
        <Text style={styles.detail}>{metadata.shortDescription}</Text>
        <Text style={styles.platform}>{metadata.setupHint}</Text>
      </View>
      <Pressable
        style={[styles.actionButton, styles.plannedBadge, isBusy && styles.actionButtonDisabled]}
        disabled={isBusy}
        onPress={handleConnect}
      >
        <Text style={styles.plannedBadgeText}>
          {isBusy ? '연결 중...' : '연결하기'}
        </Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  helperText: {
    color: colors.textSecondary,
    lineHeight: 20,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  detail: {
    color: colors.textSecondary,
  },
  platform: {
    color: colors.brand,
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 18,
  },
  pendingText: {
    color: colors.orangeText,
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 18,
  },
  connectedBadge: {
    backgroundColor: colors.successCard,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionButton: {
    minWidth: 84,
    alignItems: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.7,
  },
  connectedBadgeText: {
    color: colors.successText,
    fontWeight: '800',
  },
  plannedBadge: {
    backgroundColor: colors.orangeWash,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  plannedBadgeText: {
    color: colors.orangeText,
    fontWeight: '800',
  },
  emptyText: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
