import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';

type RunningMetricGridProps = {
  elapsedLabel: string;
  distanceLabel: string;
  averagePaceLabel: string;
  currentPaceLabel: string;
  cadenceLabel: string;
  elevationLabel: string;
};

export function RunningMetricGrid({
  elapsedLabel,
  distanceLabel,
  averagePaceLabel,
  currentPaceLabel,
  cadenceLabel,
  elevationLabel,
}: RunningMetricGridProps) {
  const metrics = [
    { label: '시간', value: elapsedLabel },
    { label: '거리', value: distanceLabel },
    { label: '평균 페이스', value: averagePaceLabel },
    { label: '현재 페이스', value: currentPaceLabel },
    { label: '케이던스', value: cadenceLabel },
    { label: '고도 상승', value: elevationLabel },
  ];

  return (
    <View style={styles.grid}>
      {metrics.map((metric) => (
        <Card key={metric.label} style={styles.card}>
          <Text style={styles.label}>{metric.label}</Text>
          <Text style={styles.value}>{metric.value}</Text>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    width: '48.5%',
    minHeight: 96,
    justifyContent: 'space-between',
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  label: {
    color: '#98A2B3',
    fontWeight: '700',
  },
  value: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
});
