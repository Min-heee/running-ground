import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { fetchIntegrationStatus } from '@/lib/api/services';
import { IntegrationStatusResponse } from '@/lib/api/types';
import { colors, radius } from '@/theme';

export default function IntegrationManagementScreen() {
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);

  useEffect(() => {
    fetchIntegrationStatus()
      .then((data) => setIntegrationStatus(data))
      .catch(() => setError('연동 정보를 불러오지 못했어.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!syncDone) return;
    const timer = setTimeout(() => setSyncDone(false), 2000);
    return () => clearTimeout(timer);
  }, [syncDone]);

  const handleSync = () => {
    setSyncing(true);
    setSyncDone(false);
    setTimeout(() => {
      setSyncing(false);
      setSyncDone(true);
    }, 1000);
  };

  const connected = integrationStatus?.sources.filter((source) => source.connected) ?? [];
  const planned = integrationStatus?.sources.filter((source) => !source.connected) ?? [];

  return (
    <Screen>
      <AuthHeader title="기록 연동 관리" subtitle="러닝 기록이 들어오는 소스를 관리하고 연결 상태를 확인할 수 있어." />

      {loading ? <ActivityIndicator size="large" color={colors.brandPrimary} /> : null}
      {error ? <ErrorBanner message={error} /> : null}

      {integrationStatus ? (
        <>
          <Card>
            <Text style={styles.sectionTitle}>연동 상태 요약</Text>
            <Text style={styles.summaryText}>현재 {connected.length}개 소스가 연결되어 있고, 최신 기록이 경쟁 화면에 반영될 수 있어.</Text>
            <PrimaryButton label={syncing ? '동기화 중...' : '지금 동기화하기'} onPress={handleSync} />
            {syncDone ? <Text style={styles.successText}>동기화가 완료됐어.</Text> : null}
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>현재 연결된 소스</Text>
            {connected.map((source) => (
              <View key={source.sourceType} style={styles.row}>
                <View style={styles.meta}>
                  <Text style={styles.name}>{source.displayName}</Text>
                  <Text style={styles.detail}>마지막 동기화 {source.lastSyncedAt ?? '정보 없음'}</Text>
                  <Text style={styles.platform}>{source.recommendedPlatform === 'ios' ? 'iPhone 추천' : source.recommendedPlatform === 'android' ? 'Android 추천' : '공통 사용 가능'}</Text>
                </View>
                <Pressable style={styles.manageButton}>
                  <Text style={styles.manageButtonText}>관리</Text>
                </Pressable>
              </View>
            ))}
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>지원 예정 소스</Text>
            {planned.map((source) => (
              <View key={source.sourceType} style={styles.row}>
                <View style={styles.meta}>
                  <Text style={styles.name}>{source.displayName}</Text>
                  <Text style={styles.detail}>추후 연동 지원 예정</Text>
                  <Text style={styles.platform}>{source.recommendedPlatform === 'ios' ? 'iPhone 추천' : source.recommendedPlatform === 'android' ? 'Android 추천' : '공통 사용 가능'}</Text>
                </View>
                <View style={styles.plannedBadge}>
                  <Text style={styles.plannedBadgeText}>예정</Text>
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  summaryText: {
    color: colors.textSecondary,
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 12,
  },
  successText: {
    color: colors.success,
    fontWeight: '700',
    marginTop: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  meta: { flex: 1, gap: 2 },
  name: { color: colors.textPrimary, fontWeight: '700' },
  detail: { color: colors.textMuted },
  platform: { color: colors.brandPrimary, fontWeight: '700', fontSize: 12 },
  manageButton: {
    backgroundColor: colors.brandPrimarySoft,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  manageButtonText: {
    color: colors.brandPrimaryDark,
    fontWeight: '800',
  },
  plannedBadge: {
    backgroundColor: colors.warningBg,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  plannedBadgeText: {
    color: colors.warningText,
    fontWeight: '800',
  },
});
