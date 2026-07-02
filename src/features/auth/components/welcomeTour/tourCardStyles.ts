import { StyleSheet } from 'react-native';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

// Shared hero-card styles for the tour step cards (welcome / permissions / connect).
export const tourCardStyles = StyleSheet.create({
  heroCard: {
    backgroundColor: colors.night,
    borderRadius: radii.heroLg,
    gap: spacing.s12,
    overflow: 'hidden',
    paddingHorizontal: spacing.s24,
    paddingVertical: spacing.s24,
  },
  iconBadge: {
    alignItems: 'center',
    backgroundColor: colors.translucentWhite18,
    borderColor: colors.brandLavender,
    borderRadius: 40,
    borderWidth: 1,
    height: 80,
    justifyContent: 'center',
    marginBottom: spacing.s10,
    width: 80,
  },
  icon: {
    fontSize: 38,
  },
  kicker: {
    color: colors.brandLighter,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
    letterSpacing: 1,
  },
  title: {
    color: colors.white,
    fontSize: fontSizes.authTitle,
    fontWeight: fontWeights.black,
    lineHeight: 40,
  },
  description: {
    color: colors.lavenderSoft,
    fontSize: fontSizes.large,
    lineHeight: 26,
  },
});
