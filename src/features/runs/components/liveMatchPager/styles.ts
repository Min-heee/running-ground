import { StyleSheet } from 'react-native';
import { colors, fixedColors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

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
    borderColor: fixedColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: fixedColors.white,
    overflow: 'hidden',
  },
  tabSelected: {
    borderColor: colors.brand,
    backgroundColor: fixedColors.brandWash,
  },
  tabPressed: {
    opacity: 0.7,
  },
  tabText: {
    color: fixedColors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  tabTextSelected: {
    color: fixedColors.brandStrong,
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
});
