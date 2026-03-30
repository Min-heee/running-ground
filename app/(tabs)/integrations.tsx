import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { IntegrationStatus } from '@/features/integrations/IntegrationStatus';
import { connectedSources } from '@/data/mock';
import { Card } from '@/components/Card';

export default function IntegrationsScreen() {
  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>기록 연동</Text>
        <Text style={styles.subtitle}>로그인 이후 연결한 기록 소스들이 자동 반영되는 영역.</Text>
      </View>

      <Card>
        <Text style={styles.tipTitle}>추천 시작 순서</Text>
        <Text style={styles.tipBody}>iPhone은 Apple Health, Android는 Health Connect부터 붙이고 이후 Garmin, Strava를 확장하는 흐름이 좋아.</Text>
      </Card>

      <IntegrationStatus sources={connectedSources} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 6 },
  title: { fontSize: 28, fontWeight: '800', color: '#101828' },
  subtitle: { color: '#475467', lineHeight: 21 },
  tipTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  tipBody: { color: '#475467', lineHeight: 21, marginTop: 6 },
});
