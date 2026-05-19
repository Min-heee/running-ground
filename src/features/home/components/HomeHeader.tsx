import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

export function HomeHeader() {
  return (
    <View style={styles.headerWrap}>
      <Text style={styles.headerLabel}>홈</Text>
      <Text style={styles.headerBrand}>RunningGround</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  headerLabel: {
    color: colors.textHeading,
    fontSize: fontSizes.pageTitle,
    fontWeight: fontWeights.extraBold,
  },
  headerBrand: {
    color: colors.brand,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
    letterSpacing: 0.4,
  },
});
