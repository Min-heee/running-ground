import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { IntegrationResultCard } from '@/features/integrations/components/IntegrationResultCard';
import { AvailableSourcesCard, ConnectedSourcesCard } from '@/features/integrations/components/IntegrationSourcesCards';
import { NativeImportDiagnosticCard } from '@/features/integrations/components/NativeImportDiagnosticCard';
import {
  integrationDeviceImportMessages,
  useIntegrationActions,
} from '@/features/integrations/hooks/useIntegrationActions';
import { NrcBridgeGuideCard } from '@/features/integrations/NrcBridgeGuideCard';
import {
  getCurrentDevicePlatform,
  sortSourcesByPriority,
  splitSourcesByStatus,
} from '@/features/integrations/sourceCatalog';
import { buildSyncSummary } from '@/features/integrations/utils/integrationMessages';
import { getRecommendedNativeHealthReadiness } from '@/integrations/nativeHealth';
import { colors } from '@/theme/tokens';

export default function IntegrationManagementScreen() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const {
    actionError,
    actionMessage,
    actionSourceType,
    deviceImporting,
    error,
    handleConnect,
    handleDisconnect,
    handleImportFromDevice,
    handleSync,
    integrationStatus,
    lastImportResult,
    loadIntegrationStatus,
    loading,
    sources,
    syncError,
    syncing,
    syncResult,
  } = useIntegrationActions({
    loadErrorMessage: '연동 정보를 불러오지 못했어.',
    connectErrorMessage: '소스 연결에 실패했어.',
    syncErrorMessage: '연동 동기화에 실패했어.',
    disconnectErrorMessage: '소스 연결 해제에 실패했어.',
    deviceImportErrorMessage: '기기 기록을 아직 읽어오지 못했어.',
    formatSyncMessage: buildSyncSummary,
    formatDeviceImportMessage: integrationDeviceImportMessages.management,
  });

  const platform = getCurrentDevicePlatform();
  const { connected, available } = splitSourcesByStatus(sources);
  const connectedSources = sortSourcesByPriority(connected);
  const availableSources = sortSourcesByPriority(available);
  const nativeHealthReadiness = getRecommendedNativeHealthReadiness(sources);
  const backHref = returnTo === 'connect-sources' ? '/connect-sources' : '/(tabs)/mypage';
  const backLabel = returnTo === 'connect-sources' ? '연동 시작으로 돌아가기' : '마이페이지로 돌아가기';

  return (
    <Screen>
      <AuthHeader
        title="기록 연동 관리"
        subtitle=""
        showBack
        backHref={backHref}
        backLabel={backLabel}
      />

      {loading ? <ActivityIndicator size="large" color={colors.brand} /> : null}
      {!loading && error ? (
        <Card>
          <Text style={styles.stateTitle}>연동 정보를 아직 못 불러왔어</Text>
          <Text style={styles.errorText}>{error}</Text>
          <PrimaryButton label="다시 불러오기" onPress={loadIntegrationStatus} />
        </Card>
      ) : null}

      {integrationStatus ? (
        <>
          <NrcBridgeGuideCard
            sources={sources}
            platform={platform}
            actionSourceType={actionSourceType}
            syncing={syncing}
            importing={deviceImporting}
            nativeHealthReady={nativeHealthReadiness?.state === 'config_ready'}
            onConnectSource={handleConnect}
            onImportDevice={handleImportFromDevice}
            onSync={handleSync}
          />

          <IntegrationResultCard
            actionMessage={actionMessage}
            actionError={actionError}
            syncError={syncError}
            syncResult={syncResult}
          />

          <NativeImportDiagnosticCard result={lastImportResult} />

          <ConnectedSourcesCard
            sources={connectedSources}
            platform={platform}
            actionSourceType={actionSourceType}
            onDisconnectSource={handleDisconnect}
          />

          <AvailableSourcesCard
            sources={availableSources}
            platform={platform}
            actionSourceType={actionSourceType}
            onConnectSource={handleConnect}
          />

          <SecondaryButton label="연동 상태 새로고침" onPress={loadIntegrationStatus} />
          <SecondaryButton label={backLabel} onPress={() => router.replace(backHref)} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stateTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  errorText: {
    color: colors.danger,
    fontWeight: '700',
    marginTop: 10,
    lineHeight: 20,
  },
});
