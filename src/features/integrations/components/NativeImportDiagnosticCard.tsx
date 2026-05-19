import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { buildImportDiagnosisHint } from '@/features/integrations/utils/integrationMessages';
import type { NativeHealthImportResult } from '@/integrations/nativeHealth';
import { colors } from '@/theme/tokens';

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
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  helperText: {
    color: colors.textSecondary,
    lineHeight: 20,
    marginTop: 8,
  },
  diagnosticGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  diagnosticChip: {
    minWidth: '47%',
    flexGrow: 1,
    backgroundColor: colors.surfaceSoft,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  diagnosticLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  diagnosticValue: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
});
