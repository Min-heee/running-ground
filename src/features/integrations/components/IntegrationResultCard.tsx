import { StyleSheet, Text } from 'react-native';

import { Card } from '@/components/Card';
import { buildSyncSummary } from '@/features/integrations/utils/integrationMessages';
import type { IntegrationSyncResponse } from '@/lib/api/types';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

type IntegrationResultCardProps = {
  actionMessage: string | null;
  actionError: string | null;
  syncError: string | null;
  syncResult: IntegrationSyncResponse | null;
};

export function IntegrationResultCard({
  actionMessage,
  actionError,
  syncError,
  syncResult,
}: IntegrationResultCardProps) {
  if (!actionMessage && !actionError && !syncError && !syncResult) {
    return null;
  }

  return (
    <Card>
      <Text style={styles.sectionTitle}>최근 연동 결과</Text>
      {actionMessage ? <Text style={styles.successText}>{actionMessage}</Text> : null}
      {!actionMessage && syncResult ? <Text style={styles.successText}>{buildSyncSummary(syncResult)}</Text> : null}
      {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
      {syncError ? <Text style={styles.errorText}>{syncError}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    color: colors.textPrimary,
  },
  successText: {
    color: colors.successText,
    fontWeight: fontWeights.bold,
    marginTop: spacing.s10,
    lineHeight: 20,
  },
  errorText: {
    color: colors.danger,
    fontWeight: fontWeights.bold,
    marginTop: spacing.s10,
    lineHeight: 20,
  },
});
