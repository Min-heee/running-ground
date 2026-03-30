import { StyleSheet, Text } from 'react-native';
import { Screen } from '@/components/Screen';
import { IntegrationStatus } from '@/features/integrations/IntegrationStatus';
import { connectedSources } from '@/data/mock';

export default function IntegrationsScreen() {
  return (
    <Screen>
      <Text style={styles.title}>기록 연동</Text>
      <IntegrationStatus sources={connectedSources} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '800', color: '#101828' },
});
