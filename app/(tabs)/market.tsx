import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';

export default function MarketScreen() {
  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text style={styles.screenTitle}>마켓</Text>
      </View>

      <Card>
        <Text style={styles.statusEyebrow}>COMING SOON</Text>
        <Text style={styles.statusTitle}>준비중</Text>
        <Text style={styles.statusDescription}>
          마켓은 준비중입니다. 러닝과 대결로 모은 포인트를 다양한 상품과 교환할 수 있도록 준비하고
          있습니다.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    marginBottom: 12,
  },
  screenTitle: {
    color: '#11161B',
    fontSize: 30,
    fontWeight: '800',
  },
  statusEyebrow: {
    color: '#8E7BFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 10,
  },
  statusTitle: {
    color: '#11161B',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 12,
  },
  statusDescription: {
    color: '#4A556F',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 24,
  },
});
