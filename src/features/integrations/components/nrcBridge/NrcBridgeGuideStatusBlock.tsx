import { Text, View } from 'react-native';
import { nrcBridgeGuideDetailStyles as styles } from './NrcBridgeGuideSection.styles';
import type { GuideSection } from './types';

type NrcBridgeGuideStatusBlockProps = {
  section: GuideSection;
};

export function NrcBridgeGuideStatusBlock({ section }: NrcBridgeGuideStatusBlockProps) {
  return (
    <View style={styles.statusRow}>
      <StatusChip label={section.statusLabel} value={section.statusValue} />
      <StatusChip label={section.sourceStatusLabel} value={section.sourceStatusValue} />
      <StatusChip label={section.bridgeStatusLabel} value={section.bridgeStatusValue} />
    </View>
  );
}

function StatusChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statusChip}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={styles.statusValue}>{value}</Text>
    </View>
  );
}
