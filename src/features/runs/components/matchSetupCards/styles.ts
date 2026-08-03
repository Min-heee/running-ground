import { StyleSheet } from 'react-native';
import { colors, fixedColors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

export const matchSetupCardStyles = StyleSheet.create({
  duelSetupCard: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(142, 123, 255, 0.35)',
    backgroundColor: 'rgba(109, 94, 247, 0.10)',
    padding: spacing.s12,
    gap: spacing.s12,
  },
  duelSection: {
    gap: spacing.s10,
  },
  tabBarWrapper: {
    marginBottom: spacing.s12,
  },
  tabBar: {
    flexDirection: 'row',
    gap: spacing.xxl,
    paddingBottom: spacing.xxl,
  },
  valueTile: {
    flex: 1,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(142, 123, 255, 0.30)',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.s10,
    alignItems: 'center',
    gap: spacing.xxs,
  },
  valueTileActive: {
    borderColor: fixedColors.brand,
    backgroundColor: fixedColors.brand,
  },
  valueTileLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  valueTileLabelActive: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  valueTileValue: {
    color: colors.brandDeep,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.extraBold,
  },
  valueTileValueActive: {
    color: fixedColors.white,
  },
  distanceInputToggleChip: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.xxl,
  },
  distanceInputToggleText: {
    color: colors.brand,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
  },
  matchDistanceScroll: {
    marginHorizontal: -2,
  },
  matchDistanceScrollContent: {
    gap: spacing.xxl,
    paddingHorizontal: spacing.xxs,
  },
  matchDistanceChip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(142, 123, 255, 0.30)',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.xxl,
  },
  matchDistanceChipSelected: {
    borderColor: fixedColors.brand,
    backgroundColor: fixedColors.brand,
  },
  matchDistanceChipText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  matchDistanceChipTextSelected: {
    color: fixedColors.white,
  },
  duelDistanceInput: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(142, 123, 255, 0.30)',
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s12,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  duelHelperText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 18,
  },
  scrollIndicatorTrack: {
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.borderMuted,
    overflow: 'hidden',
    marginTop: spacing.xxs,
  },
  scrollIndicatorTrackHidden: {
    opacity: 0,
  },
  scrollIndicatorThumb: {
    height: '100%',
    borderRadius: radii.pill,
    backgroundColor: colors.brand,
  },
  slotDateScroll: {
    marginHorizontal: -2,
  },
  slotDateScrollContent: {
    gap: spacing.xxl,
    paddingHorizontal: spacing.xxs,
  },
  slotDateChip: {
    minWidth: 70,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(142, 123, 255, 0.30)',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s10,
    alignItems: 'center',
  },
  slotDateChipSelected: {
    borderColor: fixedColors.brand,
    backgroundColor: fixedColors.brand,
  },
  slotDateChipLabel: {
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.black,
  },
  slotDateChipLabelSelected: {
    color: fixedColors.white,
  },
  slotDateChipMeta: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    marginTop: spacing.xxs,
  },
  slotDateChipMetaSelected: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  slotSectionRow: {
    flexDirection: 'row',
    gap: spacing.xxl,
  },
  slotSectionChip: {
    flex: 1,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(142, 123, 255, 0.30)',
    backgroundColor: colors.surface,
    paddingVertical: 9,
    alignItems: 'center',
  },
  slotSectionChipSelected: {
    borderColor: fixedColors.brand,
    backgroundColor: fixedColors.brand,
  },
  slotSectionChipText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.black,
  },
  slotSectionChipTextSelected: {
    color: fixedColors.white,
  },
  duelSlotScroll: {
    marginHorizontal: -2,
  },
  duelSlotScrollContent: {
    gap: spacing.xxl,
    paddingHorizontal: spacing.xxs,
  },
  duelSlotChip: {
    minWidth: 76,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(142, 123, 255, 0.30)',
    backgroundColor: colors.surface,
    paddingVertical: spacing.s10,
    alignItems: 'center',
    gap: spacing.xxs,
  },
  duelSlotChipSelected: {
    borderColor: fixedColors.brand,
    backgroundColor: fixedColors.brand,
  },
  duelSlotChipDisabled: {
    opacity: 0.45,
  },
  duelSlotLabel: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.black,
  },
  duelSlotLabelSelected: {
    color: fixedColors.white,
  },
  duelSlotClosedText: {
    color: colors.textTertiary,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.extraBold,
  },
  duelSlotWaitingCount: {
    color: colors.brand,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.bold,
  },
  duelSlotWaitingCountSelected: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
  duelResultCard: {
    borderRadius: radii.md,
    backgroundColor: 'rgba(109, 94, 247, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(142, 123, 255, 0.30)',
    padding: spacing.s14,
    gap: spacing.xl,
  },
  duelResultEyebrow: {
    color: colors.brand,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.black,
    letterSpacing: 1.5,
  },
  duelResultTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.black,
  },
  duelResultMeta: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 18,
  },
  matchCountdownPill: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    backgroundColor: fixedColors.brand,
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.lg,
  },
  matchCountdownText: {
    color: fixedColors.white,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.black,
  },
  matchNoticeBlock: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(142, 123, 255, 0.45)',
    backgroundColor: 'rgba(109, 94, 247, 0.13)',
    padding: spacing.s12,
    gap: spacing.s10,
  },
  matchNoticeText: {
    color: colors.brandDeep,
    fontSize: fontSizes.sm,
    lineHeight: 18,
  },
  matchNoticeAction: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    backgroundColor: fixedColors.brand,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.xl,
  },
  matchNoticeActionText: {
    color: fixedColors.white,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.black,
  },
  matchCancelHelperText: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    lineHeight: 16,
    textAlign: 'center',
  },
  matchForceLeaveBlock: {
    gap: spacing.xxl,
  },
  matchActionColumn: {
    gap: spacing.xxl,
  },
  matchDemandCard: {
    borderRadius: radii.md,
    backgroundColor: 'rgba(109, 94, 247, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(142, 123, 255, 0.30)',
    padding: spacing.s14,
    gap: spacing.xxl,
  },
  matchDemandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matchDemandTitle: {
    color: colors.brand,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.black,
  },
  matchDemandHeadline: {
    color: colors.textPrimary,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.black,
  },
  matchDemandText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 18,
  },
  groupParticipantList: {
    gap: spacing.xxl,
    marginTop: spacing.sm,
  },
  groupParticipantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s10,
  },
  groupParticipantRank: {
    width: 24,
    color: colors.brand,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.black,
  },
  groupParticipantCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  groupParticipantName: {
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.black,
  },
  groupParticipantMeta: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
  },
});
