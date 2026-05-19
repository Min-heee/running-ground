import { StyleSheet } from 'react-native';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

export const nrcBridgeGuideSectionStyles = StyleSheet.create({
  group: {
    gap: spacing.s12,
  },
});

export const nrcBridgeGuideDetailStyles = StyleSheet.create({
  card: {
    gap: spacing.s14,
  },
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.s12,
    alignItems: 'flex-start',
  },
  accordionMeta: {
    alignItems: 'flex-end',
    gap: spacing.xxl,
  },
  copy: {
    flex: 1,
    gap: spacing.sm,
  },
  kicker: {
    color: colors.textNeutral,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.sm,
  },
  title: {
    color: colors.textHeading,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.metric,
    lineHeight: 28,
  },
  toggleText: {
    color: colors.textNeutral,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  badge: {
    backgroundColor: colors.brandWash,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.xxl,
  },
  badgeText: {
    color: colors.brandStrong,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.sm,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxl,
  },
  statusChip: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: radii.md,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s10,
    minWidth: 96,
    gap: spacing.xxs,
  },
  statusLabel: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    color: colors.textSecondary,
  },
  statusValue: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
    color: colors.textHeading,
  },
  steps: {
    gap: spacing.s10,
  },
  stepRow: {
    flexDirection: 'row',
    gap: spacing.s10,
    alignItems: 'flex-start',
  },
  stepMarker: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.brandWash,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xxs,
  },
  stepMarkerText: {
    color: colors.brandStrong,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.sm,
  },
  stepCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  stepTitle: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
  },
  stepDescription: {
    color: colors.textMuted,
    lineHeight: 20,
  },
  actions: {
    gap: spacing.s10,
  },
  footnote: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 18,
  },
});
