import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { useTabWarmupTrace } from '@/utils/useTabWarmupTrace';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

export default function MarketScreen() {
  useTabWarmupTrace('market');
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
    marginBottom: spacing.s12,
  },
  screenTitle: {
    color: colors.nearBlack,
    fontSize: fontSizes.hero,
    fontWeight: fontWeights.extraBold,
  },
  statusEyebrow: {
    color: colors.brandAccent,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
    letterSpacing: 1.4,
    marginBottom: spacing.s10,
  },
  statusTitle: {
    color: colors.nearBlack,
    fontSize: fontSizes.pageTitle,
    fontWeight: fontWeights.extraBold,
    marginBottom: spacing.s12,
  },
  statusDescription: {
    color: colors.slateLabel,
    fontSize: 15,
    fontWeight: fontWeights.semibold,
    lineHeight: 24,
  },
});
