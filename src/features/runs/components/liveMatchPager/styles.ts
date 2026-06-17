import { StyleSheet } from 'react-native';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

export const liveMatchPagerStyles = StyleSheet.create({
  shell: {
    gap: spacing.s12,
  },
  tabRow: {
    flexDirection: 'row',
    gap: spacing.xxl,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  tabSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brandWash,
  },
  tabPressed: {
    opacity: 0.7,
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  tabTextSelected: {
    color: colors.brandStrong,
  },
  page: {
    gap: spacing.s14,
    paddingRight: 0,
  },
  androidPage: {
    gap: spacing.s14,
  },
  androidPageSlot: {
    flex: 1,
  },
  androidPageHiddenSlot: {
    flex: 1,
    display: 'none',
  },
  hint: {
    color: colors.textTertiary,
    fontSize: fontSizes.md,
    textAlign: 'center',
    fontWeight: fontWeights.bold,
  },
});
