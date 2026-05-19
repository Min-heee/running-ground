import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { buildImportDiagnosisHint } from '@/features/integrations/utils/integrationMessages';
import type { NativeHealthImportResult } from '@/integrations/nativeHealth';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type NativeImportDiagnosticCardProps = {
  result: NativeHealthImportResult | null;
};

export function NativeImportDiagnosticCard({ result }: NativeImportDiagnosticCardProps) {
  if (!result) {
    return null;
  }

  return (
    <Card>
      <Text style={styles.sectionTitle}>이번 가져오기 진단</Text>
      <View style={styles.diagnosticGrid}>
        <DiagnosticChip label="확인한 소스" value={result.sourceLabel} />
        <DiagnosticChip label="기기에서 읽음" value={`${result.fetchedRuns}개`} />
        <DiagnosticChip label="대기열 등록" value={`${result.queuedRuns}개`} />
        <DiagnosticChip label="새 반영" value={`${result.syncResult?.importedRuns ?? 0}개`} />
        <DiagnosticChip label="중복 건너뜀" value={`${result.syncResult?.duplicateRuns ?? 0}개`} />
        <DiagnosticChip label="마지막 확인" value={result.syncResult?.lastSyncedAt ?? '아직 없음'} />
      </View>
      <Text style={styles.helperText}>{buildImportDiagnosisHint(result)}</Text>
    </Card>
  );
}

type DiagnosticChipProps = {
  label: string;
  value: string;
};

function DiagnosticChip({ label, value }: DiagnosticChipProps) {
  return (
    <View style={styles.diagnosticChip}>
      <Text style={styles.diagnosticLabel}>{label}</Text>
      <Text style={styles.diagnosticValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    color: colors.textPrimary,
  },
  helperText: {
    color: colors.textSecondary,
    lineHeight: 20,
    marginTop: spacing.xxl,
  },
  diagnosticGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s10,
    marginTop: spacing.s12,
  },
  diagnosticChip: {
    minWidth: '47%',
    flexGrow: 1,
    backgroundColor: colors.surfaceSoft,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s10,
    gap: spacing.sm,
  },
  diagnosticLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  diagnosticValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
});
