import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { InfoCard } from '@/components/ui/InfoCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { IntegrationJourneyCard } from '@/features/integrations/IntegrationJourneyCard';
import { useIntegrationActions } from '@/features/integrations/hooks/useIntegrationActions';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';
import {
  type ConnectedSource,
  type RunSourceType,
} from '@/domain';
import {
  getCurrentDevicePlatform,
  getPlatformLabel,
  getRecommendedSources,
  getRecommendationCopy,
  getSourceMetadata,
} from '@/features/integrations/sourceCatalog';

export default function ConnectSourcesScreen() {
  const {
    actionError,
    actionMessage,
    actionSourceType,
    error,
    handleConnect,
    integrationStatus,
    loading,
    sources,
  } = useIntegrationActions({
    loadErrorMessage: '추천 연동 목록을 불러오지 못했어.',
    connectErrorMessage: '연동 연결에 실패했어.',
    preferConfiguredLoadError: true,
  });
  const platform = useMemo(() => getCurrentDevicePlatform(), []);
  const recommended = useMemo(
    () => (integrationStatus ? getRecommendedSources(sources, platform) : []),
    [integrationStatus, platform, sources],
  );
  const connectedCount = useMemo(() => sources.filter((source) => source.connected).length, [sources]);

  const handleContinue = useCallback(() => {
    router.replace('/(tabs)/home');
  }, []);
  const handleAddManualRun = useCallback(() => {
    router.push('/add-run');
  }, []);
  const handleOpenIntegrationSettings = useCallback(() => {
    router.push({ pathname: '/integration-management', params: { returnTo: 'connect-sources' } });
  }, []);
  const sourceRows = useMemo(() => recommended.map((source) => (
    <RecommendedSourceRow
      key={source.sourceType}
      actionSourceType={actionSourceType}
      onConnect={handleConnect}
      source={source}
    />
  )), [actionSourceType, handleConnect, recommended]);

  return (
    <Screen>
      <AuthHeader
        title="기록 연동 시작"
        subtitle="출시 MVP에선 기록이 자동 또는 안정적으로 들어오는 연동 경로를 먼저 연결하고 홈으로 들어가는 흐름이 가장 중요해."
        showBack
        backHref="/(tabs)/home"
      />

      <InfoCard title="현재 단계">로그인/회원가입은 끝났고, 이제 기록 소스를 연결해 두면 홈과 내 활동에 기록이 바로 이어져.</InfoCard>

      {integrationStatus ? (
        <IntegrationJourneyCard
          sources={sources}
          actionSourceType={actionSourceType}
          onConnectSource={handleConnect}
          onAddManualRun={handleAddManualRun}
        />
      ) : null}

      <Card>
        <Text style={styles.sectionTitle}>{getPlatformLabel(platform)} 기준 추천 연동</Text>
        <Text style={styles.sectionBody}>{getRecommendationCopy(platform)}</Text>
        <Text style={styles.helperText}>
          현재 연결된 소스는 {connectedCount}개야. 자동 기록 소스는 한 번에 1개만 연결되고, 새로 연결하면 이전 자동 연동은 자동으로 해제돼.
        </Text>

        {loading ? <ActivityIndicator size="large" color={colors.brand} /> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.list}>
          {sourceRows}
        </View>
        {actionMessage ? <Text style={styles.successText}>{actionMessage}</Text> : null}
        {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
      </Card>

      <InfoCard title="왜 필요한가요?">기록 연동은 로그인과 별개야. Apple Health, Health Connect, Manual 같은 경로를 연결하면 달린 기록이 홈, 내 활동, 친구 경쟁에 반영돼.</InfoCard>

      <View style={styles.actions}>
        <SecondaryButton
          label="연동 설정 자세히 보기"
          onPress={handleOpenIntegrationSettings}
        />
        <PrimaryButton label={connectedCount > 0 ? '홈으로 돌아가기' : '지금은 홈 먼저 보기'} onPress={handleContinue} />
        <SecondaryButton label="수동 기록부터 추가하기" onPress={handleAddManualRun} />
      </View>
    </Screen>
  );
}

const RecommendedSourceRow = memo(function RecommendedSourceRow({
  actionSourceType,
  onConnect,
  source,
}: {
  actionSourceType?: string | null;
  onConnect: (sourceType: RunSourceType) => void;
  source: ConnectedSource;
}) {
  const metadata = useMemo(() => getSourceMetadata(source.sourceType), [source.sourceType]);
  const connecting = actionSourceType === source.sourceType;
  const handlePress = useCallback(() => {
    onConnect(source.sourceType);
  }, [onConnect, source.sourceType]);

  return (
    <View style={styles.sourceRow}>
      <View style={styles.sourceMeta}>
        <Text style={styles.sourceName}>{source.displayName}</Text>
        <Text style={styles.sourceDetail}>{metadata.shortDescription}</Text>
        <Text style={styles.sourceHint}>{metadata.setupHint}</Text>
      </View>
      <Pressable
        style={[source.connected ? styles.badgeConnected : styles.badge, connecting && styles.badgeDisabled]}
        disabled={source.connected || connecting}
        onPress={handlePress}
      >
        <Text style={source.connected ? styles.badgeConnectedText : styles.badgeText}>
          {source.connected ? '연결됨' : connecting ? '연결 중...' : '지금 연결'}
        </Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  sectionTitle: { fontSize: fontSizes.title, fontWeight: fontWeights.extraBold, color: colors.textPrimary },
  sectionBody: { color: colors.textMuted, lineHeight: 21, marginTop: 6 },
  helperText: { color: colors.textSecondary, lineHeight: 20, marginTop: 8 },
  list: { gap: spacing.s12, marginTop: 12 },
  sourceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.s12,
  },
  sourceMeta: {
    flex: 1,
    gap: spacing.xxs,
  },
  sourceName: { color: colors.textHeading, fontWeight: '700' },
  sourceDetail: { color: colors.textSecondary, marginTop: 2 },
  sourceHint: { color: colors.brand, fontSize: fontSizes.sm, lineHeight: 18, marginTop: 2 },
  badge: {
    backgroundColor: colors.brandWash,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.xxl,
  },
  badgeConnected: {
    backgroundColor: colors.successCard,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.xxl,
  },
  badgeDisabled: {
    opacity: 0.7,
  },
  badgeText: {
    color: colors.brandStrong,
    fontWeight: fontWeights.bold,
  },
  badgeConnectedText: {
    color: colors.successText,
    fontWeight: fontWeights.bold,
  },
  actions: { gap: 10 },
  successText: { color: colors.successText, marginTop: spacing.s10, fontWeight: fontWeights.bold, lineHeight: 20 },
  errorText: { color: colors.danger, marginTop: 8 },
});
