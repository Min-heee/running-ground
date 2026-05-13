import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text } from 'react-native';

import { Card } from '@/components/Card';
import { colors, fontSizes, fontWeights, spacing } from '@/theme/tokens';

export function LeagueComingSoonCard() {
  return (
    <Card style={styles.comingSoonCard}>
      <MaterialCommunityIcons name="school-outline" size={42} color={colors.brand} />
      <Text style={styles.comingSoonTitle}>준비중입니다</Text>
      <Text style={styles.comingSoonText}>
        대학 리그는 인증된 학교 기준으로 공정하게 경쟁할 수 있도록 준비하고 있어요.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  comingSoonCard: {
    alignItems: 'center',
    paddingVertical: spacing.s42,
    gap: spacing.s12,
  },
  comingSoonTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.comingSoon,
    fontWeight: fontWeights.black,
  },
  comingSoonText: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 22,
    textAlign: 'center',
  },
});
