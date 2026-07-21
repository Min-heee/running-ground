import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { ConnectedSource, RunSourceType } from '@/domain';
import { isAppleHealthModuleAvailable } from '@/integrations/appleHealthAvailability';
import { NativeHealthReadiness } from '@/integrations/nativeHealth';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';
import { buildIntegrationJourneyModel, type IntegrationJourneyStep } from './integrationJourneyModel';
import { DevicePlatform, getCurrentDevicePlatform } from './sourceCatalog';

type IntegrationJourneyCardProps = {
  sources: ConnectedSource[];
  platform?: DevicePlatform;
  nativeHealthReadiness?: NativeHealthReadiness | null;
  // Whether the platform health store can be read right now (right platform +
  // custom build), independent of which brand source is connected. When set,
  // this drives whether the device-import button is shown.
  importEligible?: boolean;
  actionSourceType?: string | null;
  syncing?: boolean;
  importing?: boolean;
  onConnectSource?: (sourceType: RunSourceType) => void;
  onImportDevice?: () => void;
  onSync?: () => void;
  onAddManualRun?: () => void;
};

export function IntegrationJourneyCard({
  sources,
  platform = getCurrentDevicePlatform(),
  nativeHealthReadiness = null,
  importEligible,
  actionSourceType,
  syncing = false,
  importing = false,
  onConnectSource,
  onImportDevice,
  onSync,
  onAddManualRun,
}: IntegrationJourneyCardProps) {
  const {
    headline,
    body,
    steps,
    primarySource,
    manualSource,
    connectedCount,
    primaryConnected,
    manualConnected,
    deviceImportCompleted,
    showImportButton,
  } = useMemo(
    () => buildIntegrationJourneyModel({
      sources,
      platform,
      nativeHealthReadiness,
      importEligible,
      appleHealthAvailable: isAppleHealthModuleAvailable(),
    }),
    [importEligible, nativeHealthReadiness, platform, sources],
  );
  const stepRows = useMemo(() => steps.map((step, index) => (
    <JourneyStepRow
      key={step.id}
      index={index}
      isLast={index === steps.length - 1}
      step={step}
    />
  )), [steps]);

  const handleConnectPrimary = useCallback(() => {
    if (primarySource) {
      onConnectSource?.(primarySource.sourceType);
    }
  }, [onConnectSource, primarySource]);
  const handleConnectManual = useCallback(() => {
    if (manualSource) {
      onConnectSource?.(manualSource.sourceType);
    }
  }, [manualSource, onConnectSource]);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.copy}>
          <Text style={styles.kicker}>연동 우선순위</Text>
          <Text style={styles.title}>{headline}</Text>
          <Text style={styles.description}>{body}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{connectedCount}개 연결</Text>
        </View>
      </View>

      <View style={styles.statusRow}>
        <View style={styles.statusChip}>
          <Text style={styles.statusLabel}>기본 소스</Text>
          <Text style={styles.statusValue}>{primaryConnected ? '준비됨' : '연결 전'}</Text>
        </View>
        <View style={styles.statusChip}>
          <Text style={styles.statusLabel}>가져온 기록</Text>
          <Text style={styles.statusValue}>{deviceImportCompleted ? '기록 감지됨' : '아직 없음'}</Text>
        </View>
        <View style={styles.statusChip}>
          <Text style={styles.statusLabel}>수동 입력</Text>
          <Text style={styles.statusValue}>{manualConnected ? '열림' : '추가 가능'}</Text>
        </View>
      </View>

      <View style={styles.steps}>
        {stepRows}
      </View>

      <View style={styles.actions}>
        {!primaryConnected && primarySource && onConnectSource ? (
          <PrimaryButton
            label={actionSourceType === primarySource.sourceType ? '기본 소스 연결 중...' : `${primarySource.displayName} 연결하기`}
            onPress={handleConnectPrimary}
          />
        ) : null}

        {showImportButton && onImportDevice ? (
          <PrimaryButton
            label={importing ? '기기 기록 가져오는 중...' : '기기 기록 가져오기'}
            onPress={onImportDevice}
          />
        ) : null}

        {!manualConnected && manualSource && onConnectSource ? (
          <SecondaryButton
            label={actionSourceType === 'manual' ? '수동 입력 준비 중...' : '수동 입력 경로 열기'}
            onPress={handleConnectManual}
          />
        ) : null}

        {onAddManualRun ? <SecondaryButton label="수동 기록 추가" onPress={onAddManualRun} /> : null}
        {onSync ? <SecondaryButton label={syncing ? '동기화 중...' : '지금 동기화하기'} onPress={onSync} /> : null}
      </View>
    </Card>
  );
}

const JourneyStepRow = memo(function JourneyStepRow({
  index,
  isLast,
  step,
}: {
  index: number;
  isLast: boolean;
  step: IntegrationJourneyStep;
}) {
  return (
    <View style={[styles.stepRow, isLast && styles.stepRowLast]}>
      <View style={[styles.stepMarker, step.complete ? styles.stepMarkerDone : styles.stepMarkerPending]}>
        <Text style={[styles.stepMarkerText, step.complete ? styles.stepMarkerTextDone : styles.stepMarkerTextPending]}>
          {step.complete ? '완료' : String(index + 1)}
        </Text>
      </View>
      <View style={styles.stepCopy}>
        <Text style={styles.stepTitle}>{step.title}</Text>
        <Text style={styles.stepDescription}>{step.description}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    gap: spacing.s14,
  },
  header: {
    flexDirection: 'row',
    gap: spacing.s12,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  copy: {
    flex: 1,
    gap: spacing.sm,
  },
  kicker: {
    color: colors.textNeutral,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.sm,
  },
  title: {
    color: colors.textHeading,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.metric,
    lineHeight: 28,
  },
  description: {
    color: colors.textMuted,
    lineHeight: 21,
  },
  badge: {
    backgroundColor: colors.brandWash,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.xxl,
  },
  badgeText: {
    color: colors.brandStrong,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.sm,
  },
  statusRow: {
    flexDirection: 'row',
    gap: spacing.xxl,
  },
  statusChip: {
    flex: 1,
    backgroundColor: colors.surfaceSoft,
    borderRadius: radii.md,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s10,
    gap: spacing.xxs,
  },
  statusLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  statusValue: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
  },
  steps: {
    gap: spacing.s10,
  },
  stepRow: {
    flexDirection: 'row',
    gap: spacing.s10,
    paddingBottom: spacing.s10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  stepRowLast: {
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  stepMarker: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepMarkerDone: {
    backgroundColor: colors.successCard,
  },
  stepMarkerPending: {
    backgroundColor: colors.purpleRowSoft,
  },
  stepMarkerText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  stepMarkerTextDone: {
    color: colors.successText,
  },
  stepMarkerTextPending: {
    color: colors.brandStrong,
  },
  stepCopy: {
    flex: 1,
    gap: spacing.xxs,
    paddingTop: spacing.xxs,
  },
  stepTitle: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
  },
  stepDescription: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  actions: {
    gap: spacing.s10,
  },
});
