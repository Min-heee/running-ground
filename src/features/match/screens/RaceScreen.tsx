import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { useTabWarmupTrace } from '@/utils/useTabWarmupTrace';

export default function RaceScreen() {
  useTabWarmupTrace('race');
  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text style={styles.screenTitle}>레이스</Text>
      </View>

      <Card>
        <Text style={styles.statusEyebrow}>COMING SOON</Text>
        <Text style={styles.statusTitle}>준비중</Text>
        <Text style={styles.statusDescription}>
          레이스는 온라인 마라톤을 준비중입니다. 온라인 마라톤은 장소 제약 없이 각자 뛰고 싶은
          장소에서 달린 뒤 기록으로 함께 경쟁하는 방식으로 제공될 예정입니다.
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
