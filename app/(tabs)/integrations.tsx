import { StyleSheet, Text } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';

export default function IntegrationsScreen() {
  return (
    <Screen>
      <Text style={styles.title}>기록 연동</Text>
      <Card>
        <SectionTitle>연결된 소스</SectionTitle>
        <Text style={styles.row}>Apple Health · 연결됨</Text>
        <Text style={styles.row}>Manual · 연결됨</Text>
      </Card>

      <Card>
        <SectionTitle>지원 예정</SectionTitle>
        <Text style={styles.row}>Garmin</Text>
        <Text style={styles.row}>Strava</Text>
        <Text style={styles.row}>NRC</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '800', color: '#101828' },
  row: { color: '#344054', paddingVertical: 8, fontWeight: '600' },
});
