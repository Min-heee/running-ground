import { StyleSheet } from 'react-native';
import { colors, fixedColors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

export const liveMatchTrackingStyles = StyleSheet.create({
  mapCard: {
    gap: spacing.s14,
    backgroundColor: fixedColors.textPrimary,
  },
  liveMatchCard: {
    gap: spacing.md,
    padding: spacing.s14,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.darkSoft,
    backgroundColor: colors.darkMuted,
  },
  liveMatchEyebrow: {
    color: colors.brandLighter,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
    letterSpacing: 0.4,
  },
  liveMatchTitle: {
    color: colors.white,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  liveMatchText: {
    color: fixedColors.border,
    lineHeight: 20,
  },
  groupLiveCard: {
    gap: spacing.s12,
    padding: spacing.s14,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.indigoDeep,
    backgroundColor: fixedColors.textPrimary,
  },
  duelLiveCard: {
    gap: spacing.s12,
    padding: spacing.s14,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: fixedColors.blueStrong,
    backgroundColor: colors.slateDark,
  },
  duelLiveHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.s12,
  },
  duelLiveBadge: {
    borderRadius: radii.pill,
    backgroundColor: colors.blueInk,
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.xl,
  },
  duelLiveBadgeText: {
    color: colors.blueWash,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
  },
  matchStatusBanner: {
    gap: spacing.sm,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s10,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  matchStatusBannerNeutral: {
    backgroundColor: 'rgba(148, 163, 184, 0.10)',
    borderColor: 'rgba(148, 163, 184, 0.18)',
  },
  matchStatusBannerWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.22)',
  },
  matchStatusBannerDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.22)',
  },
  matchStatusBannerTitle: {
    color: colors.white,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
  },
  matchStatusBannerText: {
    color: fixedColors.border,
    fontSize: fontSizes.sm,
    lineHeight: 18,
  },
  matchStatusBannerAction: {
    alignSelf: 'flex-start',
    marginTop: spacing.xxs,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.xxl,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  matchStatusBannerActionText: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  groupLiveHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.s12,
  },
  groupLiveHeaderCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  groupLiveTitle: {
    color: colors.white,
    fontSize: fontSizes.metric,
    fontWeight: fontWeights.extraBold,
  },
  groupLiveSummary: {
    color: fixedColors.border,
    lineHeight: 20,
  },
  groupLiveGapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxl,
    marginTop: spacing.xxs,
  },
  groupLiveGapChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.xl,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(129, 140, 248, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.22)',
  },
  groupLiveGapEyebrow: {
    color: colors.brandLighter,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.extraBold,
  },
  groupLiveGapText: {
    color: fixedColors.surfaceSubtleAlt,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  groupLiveBadge: {
    borderRadius: radii.pill,
    backgroundColor: colors.indigoStrong,
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.xl,
  },
  groupLiveBadgeText: {
    color: fixedColors.brandWash,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
  },
  groupLiveTopList: {
    gap: spacing.xxl,
  },
  groupLiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s10,
    padding: spacing.s10,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  groupLiveRowCurrent: {
    backgroundColor: 'rgba(109, 94, 247, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.45)',
  },
  groupLiveRank: {
    width: 24,
    color: colors.brandLighter,
    fontWeight: fontWeights.extraBold,
  },
  groupLiveCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  groupLiveName: {
    color: colors.white,
    fontWeight: fontWeights.extraBold,
  },
  groupLiveMeta: {
    color: fixedColors.border,
    fontSize: fontSizes.sm,
    lineHeight: 17,
  },
  groupLiveDistance: {
    color: colors.white,
    fontWeight: fontWeights.extraBold,
  },
  groupLiveFooter: {
    color: fixedColors.border,
    lineHeight: 20,
  },
});
