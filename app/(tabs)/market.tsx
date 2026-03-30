import { StyleSheet, Text } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';

export default function MarketScreen() {
  return (
    <Screen>
      <Text style={styles.title}>마켓</Text>
      <Card>
        <SectionTitle>준비 중</SectionTitle>
        <Text style={styles.row}>포인트/마일리지 기반 리워드와 아이템 구조를 붙일 예정.</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '800', color: '#101828' },
  row: { color: '#344054', paddingVertical: 8, fontWeight: '600' },
});
