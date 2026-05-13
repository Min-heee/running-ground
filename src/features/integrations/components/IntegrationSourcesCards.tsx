import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { getCurrentDevicePlatform, getSourceMetadata } from '@/features/integrations/sourceCatalog';
import type { RunSourceType } from '@/domain';
import type { IntegrationStatusResponse } from '@/lib/api/types';

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
  return (
    <Card>
      <Text style={styles.sectionTitle}>지금 연결된 소스</Text>
      <Text style={styles.helperText}>자동 기록 소스는 한 번에 1개만 연결돼. 새로 연결하면 이전 자동 연동은 자동으로 해제돼.</Text>
      {sources.map((source) => {
        const metadata = getSourceMetadata(source.sourceType, platform);

        return (
          <View key={source.sourceType} style={styles.row}>
            <View style={styles.meta}>
              <Text style={styles.name}>{source.displayName}</Text>
              <Text style={styles.detail}>마지막 동기화 {source.lastSyncedAt ?? '아직 없음'}</Text>
              {source.pendingImportCount ? <Text style={styles.pendingText}>대기 중인 가져오기 {source.pendingImportCount}개</Text> : null}
              <Text style={styles.platform}>{metadata.shortDescription}</Text>
            </View>
            <Pressable
              style={[styles.actionButton, styles.connectedBadge, actionSourceType === source.sourceType && styles.actionButtonDisabled]}
              disabled={actionSourceType === source.sourceType}
              onPress={() => {
                void onDisconnectSource(source.sourceType);
              }}
            >
              <Text style={styles.connectedBadgeText}>
                {actionSourceType === source.sourceType ? '처리 중...' : '해제'}
              </Text>
            </Pressable>
          </View>
        );
      })}
      {sources.length === 0 ? <Text style={styles.emptyText}>아직 연결된 기록 소스가 없어.</Text> : null}
    </Card>
  );
}

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
  return (
    <Card>
      <Text style={styles.sectionTitle}>추가로 붙일 수 있는 소스</Text>
      {sources.map((source) => {
        const metadata = getSourceMetadata(source.sourceType, platform);

        return (
          <View key={source.sourceType} style={styles.row}>
            <View style={styles.meta}>
              <Text style={styles.name}>{source.displayName}</Text>
              <Text style={styles.detail}>{metadata.shortDescription}</Text>
              <Text style={styles.platform}>{metadata.setupHint}</Text>
            </View>
            <Pressable
              style={[styles.actionButton, styles.plannedBadge, actionSourceType === source.sourceType && styles.actionButtonDisabled]}
              disabled={actionSourceType === source.sourceType}
              onPress={() => {
                void onConnectSource(source.sourceType);
              }}
            >
              <Text style={styles.plannedBadgeText}>
                {actionSourceType === source.sourceType ? '연결 중...' : '연결하기'}
              </Text>
            </Pressable>
          </View>
        );
      })}
      {sources.length === 0 ? <Text style={styles.emptyText}>지금 바로 추가로 붙일 확장 소스가 없어.</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  helperText: {
    color: '#667085',
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
    borderBottomColor: '#EAECF0',
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: '#111827',
    fontWeight: '700',
  },
  detail: {
    color: '#667085',
  },
  platform: {
    color: '#6D5EF7',
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 18,
  },
  pendingText: {
    color: '#C2410C',
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 18,
  },
  connectedBadge: {
    backgroundColor: '#ECFDF3',
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
    color: '#067647',
    fontWeight: '800',
  },
  plannedBadge: {
    backgroundColor: '#FFF7ED',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  plannedBadgeText: {
    color: '#C2410C',
    fontWeight: '800',
  },
  emptyText: {
    color: '#667085',
    lineHeight: 20,
  },
});
