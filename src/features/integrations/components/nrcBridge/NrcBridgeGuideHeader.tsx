import { Pressable, Text, View } from 'react-native';
import { nrcBridgeGuideDetailStyles as styles } from './NrcBridgeGuideSection.styles';
import type { GuideSection } from './types';

type NrcBridgeGuideHeaderProps = {
  expanded: boolean;
  onToggle: () => void;
  section: GuideSection;
};

export function NrcBridgeGuideHeader({
  expanded,
  onToggle,
  section,
}: NrcBridgeGuideHeaderProps) {
  return (
    <Pressable
      style={styles.accordionHeader}
      onPress={onToggle}
    >
      <View style={styles.copy}>
        <Text style={styles.kicker}>{section.kicker}</Text>
        <Text style={styles.title}>{section.title}</Text>
      </View>
      <View style={styles.accordionMeta}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{section.badge}</Text>
        </View>
        <Text style={styles.toggleText}>{expanded ? '접기' : '열기'}</Text>
      </View>
    </Pressable>
  );
}
