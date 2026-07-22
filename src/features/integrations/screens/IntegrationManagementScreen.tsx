import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { ExclusiveSourceSelectorCard } from '@/features/integrations/components/ExclusiveSourceSelectorCard';
import { GuidedConnectCard } from '@/features/integrations/components/GuidedConnectCard';
import { IntegrationResultCard } from '@/features/integrations/components/IntegrationResultCard';
import { NativeImportDiagnosticCard } from '@/features/integrations/components/NativeImportDiagnosticCard';
import {
  integrationDeviceImportMessages,
  useIntegrationActions,
} from '@/features/integrations/hooks/useIntegrationActions';
import { getCurrentDevicePlatform } from '@/features/integrations/sourceCatalog';
import { buildSyncSummary } from '@/features/integrations/utils/integrationMessages';
import { isAppleHealthModuleAvailable } from '@/integrations/appleHealthAvailability';
import { getNativeHealthImportEligibility } from '@/integrations/nativeHealth';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

export default function IntegrationManagementScreen() {
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
    loadErrorMessage: '연동 정보를 불러오지 못했어요.',
    connectErrorMessage: '소스 연결에 실패했어요.',
    syncErrorMessage: '연동 동기화에 실패했어요.',
    disconnectErrorMessage: '소스 연결 해제에 실패했어요.',
    deviceImportErrorMessage: '기기 기록을 아직 읽어오지 못했어요.',
    formatSyncMessage: buildSyncSummary,
    formatDeviceImportMessage: integrationDeviceImportMessages.management,
  });

  const platform = getCurrentDevicePlatform();
  // Show the device-import button whenever the platform health store can be read
  // (right platform + custom build), regardless of which brand source the user
  // connected — brand apps route their workouts into the platform store anyway.
  const importEligibility = getNativeHealthImportEligibility();
  const backHref = '/(tabs)/mypage';
  const backLabel = '마이페이지로 돌아가기';

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
          <Text style={styles.stateTitle}>연동 정보를 아직 못 불러왔어요</Text>
          <Text style={styles.errorText}>{error}</Text>
          <PrimaryButton label="다시 불러오기" onPress={loadIntegrationStatus} />
        </Card>
      ) : null}

      {integrationStatus ? (
        <>
          {/* 앱 중심 가이드 플로우 (오너 요청 2026-07-22): 쓰는 러닝 앱을 고르면
              허브 경유 설정 → 읽기 권한 → 가져오기를 순서대로 안내한다. 허브를
              읽을 수 있는 환경(iOS 모듈 보유 빌드 / Android)에서만 노출. */}
          {importEligibility?.canImport && (platform === 'ios' || platform === 'android') ? (
            <GuidedConnectCard
              platform={platform}
              deviceImporting={deviceImporting}
              onImportFromDevice={handleImportFromDevice}
            />
          ) : null}

          <Card style={styles.syncActionCard}>
            <Text style={styles.stateTitle}>기록 가져오기</Text>
            {platform === 'ios' && !isAppleHealthModuleAvailable() ? null : (
              // HealthKit-free binary (build 48)에선 iOS 자동 가져오기가 없으므로 설명 자체를
              // 숨긴다 (오너 결정). 빌드 49+는 모듈이 있어 일반 안내가 그대로 나온다.
              <Text style={styles.helperText}>
                소스를 연결하는 건 어디서 가져올지 고르는 것뿐이에요. 실제로 러닝 기록을 끌어오려면
                아래 [기기에서 기록 가져오기]를 눌러주세요.
              </Text>
            )}
            {importEligibility?.canImport ? (
              <PrimaryButton
                label={deviceImporting ? '기기 기록 가져오는 중...' : '기기에서 기록 가져오기'}
                onPress={handleImportFromDevice}
                disabled={deviceImporting}
              />
            ) : importEligibility?.blockedReason ? (
              <Text style={styles.blockedText}>{importEligibility.blockedReason}</Text>
            ) : null}
            <SecondaryButton
              label={syncing ? '확인 중...' : '다시 확인하기'}
              onPress={handleSync}
              disabled={syncing}
            />
          </Card>

          <IntegrationResultCard
            actionMessage={actionMessage}
            actionError={actionError}
            syncError={syncError}
            syncResult={syncResult}
          />

          <NativeImportDiagnosticCard result={lastImportResult} />

          <ExclusiveSourceSelectorCard
            sources={sources}
            platform={platform}
            actionSourceType={actionSourceType}
            onConnectSource={handleConnect}
            onDisconnectSource={handleDisconnect}
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
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    color: colors.textPrimary,
  },
  errorText: {
    color: colors.danger,
    fontWeight: fontWeights.bold,
    marginTop: spacing.s10,
    lineHeight: 20,
  },
  helperText: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  blockedText: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  syncActionCard: {
    gap: spacing.s12,
  },
});
