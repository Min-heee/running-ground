import { StyleSheet, Text } from 'react-native';

import { Card } from '@/components/Card';
import { buildSyncSummary } from '@/features/integrations/utils/integrationMessages';
import type { IntegrationSyncResponse } from '@/lib/api/types';

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
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  successText: {
    color: '#067647',
    fontWeight: '700',
    marginTop: 10,
    lineHeight: 20,
  },
  errorText: {
    color: '#B42318',
    fontWeight: '700',
    marginTop: 10,
    lineHeight: 20,
  },
});
