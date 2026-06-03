import { StyleSheet } from 'react-native';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

export const matchSetupCardStyles = StyleSheet.create({
  duelSetupCard: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.brandStrong,
    backgroundColor: colors.textPrimary,
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
  tabPill: {
    flex: 1,
    borderRadius: radii.cardLarge,
    borderWidth: 1,
    borderColor: colors.darkSoft,
    backgroundColor: colors.darkMuted,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s10,
    alignItems: 'center',
  },
  tabPillActive: {
    borderColor: colors.brandLight,
    backgroundColor: colors.indigoDeep,
  },
  tabPillLabel: {
    color: colors.borderNeutral,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  tabPillLabelActive: {
    color: colors.white,
  },
  distanceInputToggleChip: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.darkSoft,
    borderRadius: radii.pill,
    backgroundColor: colors.darkMuted,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.xxl,
  },
  distanceInputToggleText: {
    color: colors.brandLighter,
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
    borderColor: colors.darkSoft,
    backgroundColor: colors.darkMuted,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.xxl,
  },
  matchDistanceChipSelected: {
    borderColor: colors.brandLight,
    backgroundColor: colors.indigoDeep,
  },
  matchDistanceChipText: {
    color: colors.borderNeutral,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  matchDistanceChipTextSelected: {
    color: colors.white,
  },
  duelDistanceInput: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.darkSoft,
    backgroundColor: colors.darkInk,
    color: colors.white,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s12,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  duelHelperText: {
    color: colors.brandTint,
    fontSize: fontSizes.sm,
    lineHeight: 18,
  },
  scrollIndicatorTrack: {
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.darkSoft,
    overflow: 'hidden',
    marginTop: spacing.xxs,
  },
  scrollIndicatorTrackHidden: {
    opacity: 0,
  },
  scrollIndicatorThumb: {
    height: '100%',
    borderRadius: radii.pill,
    backgroundColor: colors.brandLight,
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
    borderColor: colors.darkSoft,
    backgroundColor: colors.darkInk,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s10,
    alignItems: 'center',
  },
  slotDateChipSelected: {
    borderColor: colors.brandLight,
    backgroundColor: colors.indigoDeep,
  },
  slotDateChipLabel: {
    color: colors.borderNeutral,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.black,
  },
  slotDateChipLabelSelected: {
    color: colors.white,
  },
  slotDateChipMeta: {
    color: colors.textPlaceholder,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    marginTop: spacing.xxs,
  },
  slotDateChipMetaSelected: {
    color: colors.brandLighter,
  },
  slotSectionRow: {
    flexDirection: 'row',
    gap: spacing.xxl,
  },
  slotSectionChip: {
    flex: 1,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.darkSoft,
    backgroundColor: colors.darkInk,
    paddingVertical: 9,
    alignItems: 'center',
  },
  slotSectionChipSelected: {
    borderColor: colors.brandLight,
    backgroundColor: colors.indigoDeep,
  },
  slotSectionChipText: {
    color: colors.textPlaceholder,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.black,
  },
  slotSectionChipTextSelected: {
    color: colors.white,
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
    borderColor: colors.darkSoft,
    backgroundColor: colors.darkInk,
    paddingVertical: spacing.s10,
    alignItems: 'center',
    gap: spacing.xxs,
  },
  duelSlotChipSelected: {
    borderColor: colors.brandLight,
    backgroundColor: colors.indigoDeep,
  },
  duelSlotChipDisabled: {
    opacity: 0.45,
  },
  duelSlotLabel: {
    color: colors.borderNeutral,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.black,
  },
  duelSlotLabelSelected: {
    color: colors.white,
  },
  duelSlotClosedText: {
    color: colors.textPlaceholder,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.extraBold,
  },
  duelResultCard: {
    borderRadius: radii.md,
    backgroundColor: colors.darkMuted,
    borderWidth: 1,
    borderColor: colors.darkSoft,
    padding: spacing.s14,
    gap: spacing.xl,
  },
  duelResultEyebrow: {
    color: colors.brandLighter,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.black,
    letterSpacing: 1.5,
  },
  duelResultTitle: {
    color: colors.white,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.black,
  },
  duelResultMeta: {
    color: colors.borderNeutral,
    fontSize: fontSizes.sm,
    lineHeight: 18,
  },
  matchCountdownPill: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    backgroundColor: colors.indigoDeep,
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.lg,
  },
  matchCountdownText: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.black,
  },
  matchNoticeBlock: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.brandLight,
    backgroundColor: colors.indigoInk,
    padding: spacing.s12,
    gap: spacing.s10,
  },
  matchNoticeText: {
    color: colors.brandWashStrong,
    fontSize: fontSizes.sm,
    lineHeight: 18,
  },
  matchNoticeAction: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    backgroundColor: colors.brandWash,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.xl,
  },
  matchNoticeActionText: {
    color: colors.brandStrong,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.black,
  },
  matchCancelHelperText: {
    color: colors.brandTint,
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
    backgroundColor: colors.darkMuted,
    borderWidth: 1,
    borderColor: colors.darkSoft,
    padding: spacing.s14,
    gap: spacing.xxl,
  },
  matchDemandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matchDemandTitle: {
    color: colors.brandLighter,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.black,
  },
  matchDemandHeadline: {
    color: colors.white,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.black,
  },
  matchDemandText: {
    color: colors.borderNeutral,
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
    color: colors.brandLighter,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.black,
  },
  groupParticipantCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  groupParticipantName: {
    color: colors.white,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.black,
  },
  groupParticipantMeta: {
    color: colors.borderNeutral,
    fontSize: fontSizes.xs,
  },
});
