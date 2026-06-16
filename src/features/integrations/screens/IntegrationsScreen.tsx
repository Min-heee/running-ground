import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { IntegrationJourneyCard } from '@/features/integrations/IntegrationJourneyCard';
import { IntegrationStatus } from '@/features/integrations/IntegrationStatus';
import { NrcBridgeGuideCard } from '@/features/integrations/NrcBridgeGuideCard';
import { NativeHealthReadinessCard } from '@/features/integrations/NativeHealthReadinessCard';
import { Card } from '@/components/Card';
import { useIntegrationActions } from '@/features/integrations/hooks/useIntegrationActions';
import {
  getCoverageSummary,
  getCurrentDevicePlatform,
  getPlatformLabel,
  getRecommendationCopy,
} from '@/features/integrations/sourceCatalog';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { getRecommendedNativeHealthReadiness } from '@/integrations/nativeHealth';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

export default function IntegrationsScreen() {
  const {
    actionError,
    actionMessage,
    actionSourceType,
    deviceImporting,
    error,
    handleConnect,
    handleImportFromDevice,
    handleSync,
    integrationStatus,
    loadIntegrationStatus,
    loading,
    sources,
    syncing,
    syncResult,
  } = useIntegrationActions({
    loadErrorMessage: '연동 상태를 불러오지 못했어.',
    connectErrorMessage: '연동 연결에 실패했어.',
    syncErrorMessage: '지금 동기화하지 못했어.',
    deviceImportErrorMessage: '기기 기록을 아직 읽어오지 못했어.',
    mirrorSyncErrorToActionError: true,
  });
  const platform = getCurrentDevicePlatform();
  const coverage = integrationStatus ? getCoverageSummary(sources, platform) : null;
  const nativeHealthReadiness = getRecommendedNativeHealthReadiness(sources);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>기록 연동</Text>
        <Text style={styles.subtitle}>로그인 이후 연결한 기록 소스들이 자동 반영되는 영역.</Text>
      </View>

      <Card>
        <Text style={styles.tipTitle}>{getPlatformLabel(platform)} 기준 추천 시작 순서</Text>
        <Text style={styles.tipBody}>{getRecommendationCopy(platform)}</Text>
        <Text style={styles.policyText}>자동 기록 소스는 한 번에 1개만 연결돼. 새로 연결하면 이전 자동 연동은 자동으로 해제돼.</Text>
        {coverage ? (
          <Text style={styles.coverageText}>
            추천 소스 {coverage.recommendedCount}개 중 {coverage.connectedRecommendedCount}개가 이미 준비됐어.
          </Text>
        ) : null}
        {syncResult ? <Text style={styles.syncText}>마지막 동기화에서 {syncResult.importedRuns}개 새 기록을 반영했어.</Text> : null}
        {actionMessage ? <Text style={styles.successText}>{actionMessage}</Text> : null}
        {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
      </Card>

      {loading ? <ActivityIndicator size="large" color={colors.brand} /> : null}
      {!loading && error ? (
        <Card>
          <Text style={styles.errorTitle}>연동 상태를 아직 못 불러왔어</Text>
          <Text style={styles.errorText}>{error}</Text>
          <PrimaryButton label="다시 불러오기" onPress={loadIntegrationStatus} />
        </Card>
      ) : null}
      {integrationStatus ? (
        <>
          <NativeHealthReadinessCard sources={sources}>
            {nativeHealthReadiness?.state === 'config_ready' ? (
              <PrimaryButton
                label={deviceImporting ? '기기 기록 가져오는 중...' : '기기에서 기록 가져오기'}
                onPress={handleImportFromDevice}
              />
            ) : null}
          </NativeHealthReadinessCard>
          <NrcBridgeGuideCard
            sources={sources}
            platform={platform}
            actionSourceType={actionSourceType}
            syncing={syncing}
            onConnectSource={handleConnect}
            onSync={handleSync}
          />
          <IntegrationJourneyCard
            sources={sources}
            nativeHealthReadiness={nativeHealthReadiness}
            actionSourceType={actionSourceType}
            syncing={syncing}
            importing={deviceImporting}
            onConnectSource={handleConnect}
            onImportDevice={handleImportFromDevice}
            onSync={handleSync}
            onAddManualRun={() => router.push('/add-run')}
          />
          <IntegrationStatus sources={sources} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 6 },
  title: { fontSize: fontSizes.pageTitle, fontWeight: fontWeights.extraBold, color: colors.textHeading },
  subtitle: { color: colors.textMuted, lineHeight: 21 },
  tipTitle: { fontSize: fontSizes.button, fontWeight: fontWeights.extraBold, color: colors.textPrimary },
  tipBody: { color: colors.textMuted, lineHeight: 21, marginTop: 6 },
  policyText: { color: colors.textSecondary, lineHeight: 20, marginTop: 8 },
  coverageText: { color: colors.brand, fontWeight: fontWeights.bold, marginTop: 8 },
  syncText: { color: colors.textMuted, lineHeight: 20, marginTop: 8 },
  successText: { color: colors.successText, fontWeight: fontWeights.bold, marginTop: spacing.xxl, lineHeight: 20 },
  errorTitle: { color: colors.textPrimary, fontWeight: fontWeights.extraBold, fontSize: fontSizes.title },
  errorText: { color: colors.danger, fontWeight: fontWeights.bold, lineHeight: 20, marginTop: 10 },
});
