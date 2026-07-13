import { StyleSheet, Text } from 'react-native';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { TabHeader } from '@/components/ui/TabHeader';
import { useTabWarmupTrace } from '@/utils/useTabWarmupTrace';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

export default function MarketScreen() {
  useTabWarmupTrace('market');
  return (
    <Screen>
      <TabHeader title="마켓" />

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
  statusEyebrow: {
    color: colors.brandAccent,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
    letterSpacing: 1.4,
    marginBottom: spacing.s10,
  },
  statusTitle: {
    color: colors.textHeading,
    fontSize: fontSizes.pageTitle,
    fontWeight: fontWeights.extraBold,
    marginBottom: spacing.s12,
  },
  statusDescription: {
    color: colors.textSecondary,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.semibold,
    lineHeight: 24,
  },
});
