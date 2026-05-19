import { StyleSheet } from 'react-native';
import { colors } from '@/theme/tokens';

export const matchSetupCardStyles = StyleSheet.create({
  duelSetupCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.brandStrong,
    backgroundColor: colors.textPrimary,
    padding: 12,
    gap: 12,
  },
  duelSection: {
    gap: 10,
  },
  duelSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  duelSectionTitle: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
  distanceInputToggle: {
    borderRadius: 999,
    backgroundColor: colors.darkMuted,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  distanceInputToggleText: {
    color: colors.brandLighter,
    fontSize: 11,
    fontWeight: '800',
  },
  matchDistanceChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  matchDistanceChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.darkSoft,
    backgroundColor: colors.darkMuted,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  matchDistanceChipSelected: {
    borderColor: colors.brandLight,
    backgroundColor: colors.indigoDeep,
  },
  matchDistanceChipText: {
    color: colors.borderNeutral,
    fontSize: 12,
    fontWeight: '800',
  },
  matchDistanceChipTextSelected: {
    color: colors.white,
  },
  duelDistanceInput: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.darkSoft,
    backgroundColor: colors.darkInk,
    color: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '700',
  },
  duelHelperText: {
    color: colors.brandTint,
    fontSize: 12,
    lineHeight: 18,
  },
  slotDateScroll: {
    marginHorizontal: -2,
  },
  slotDateScrollContent: {
    gap: 8,
    paddingHorizontal: 2,
  },
  slotDateChip: {
    minWidth: 70,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.darkSoft,
    backgroundColor: colors.darkInk,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  slotDateChipSelected: {
    borderColor: colors.brandLight,
    backgroundColor: colors.indigoDeep,
  },
  slotDateChipLabel: {
    color: colors.borderNeutral,
    fontSize: 13,
    fontWeight: '900',
  },
  slotDateChipLabelSelected: {
    color: colors.white,
  },
  slotDateChipMeta: {
    color: colors.textPlaceholder,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  slotDateChipMetaSelected: {
    color: colors.brandLighter,
  },
  slotSectionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  slotSectionChip: {
    flex: 1,
    borderRadius: 999,
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
    fontSize: 12,
    fontWeight: '900',
  },
  slotSectionChipTextSelected: {
    color: colors.white,
  },
  duelSlotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  duelSlotChip: {
    width: '30%',
    minWidth: 76,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.darkSoft,
    backgroundColor: colors.darkInk,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 2,
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
    fontSize: 12,
    fontWeight: '900',
  },
  duelSlotLabelSelected: {
    color: colors.white,
  },
  duelSlotClosedText: {
    color: colors.textPlaceholder,
    fontSize: 10,
    fontWeight: '800',
  },
  duelResultCard: {
    borderRadius: 16,
    backgroundColor: colors.darkMuted,
    borderWidth: 1,
    borderColor: colors.darkSoft,
    padding: 14,
    gap: 7,
  },
  duelResultEyebrow: {
    color: colors.brandLighter,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  duelResultTitle: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '900',
  },
  duelResultMeta: {
    color: colors.borderNeutral,
    fontSize: 12,
    lineHeight: 18,
  },
  matchCountdownPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: colors.indigoDeep,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  matchCountdownText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '900',
  },
  matchNoticeBlock: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.brandLight,
    backgroundColor: colors.indigoInk,
    padding: 12,
    gap: 10,
  },
  matchNoticeText: {
    color: colors.brandWashStrong,
    fontSize: 12,
    lineHeight: 18,
  },
  matchNoticeAction: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: colors.brandWash,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  matchNoticeActionText: {
    color: colors.brandStrong,
    fontSize: 12,
    fontWeight: '900',
  },
  matchCancelHelperText: {
    color: colors.brandTint,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  matchActionColumn: {
    gap: 8,
  },
  matchDemandCard: {
    borderRadius: 16,
    backgroundColor: colors.darkMuted,
    borderWidth: 1,
    borderColor: colors.darkSoft,
    padding: 14,
    gap: 8,
  },
  matchDemandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matchDemandTitle: {
    color: colors.brandLighter,
    fontSize: 12,
    fontWeight: '900',
  },
  matchDemandHeadline: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '900',
  },
  matchDemandText: {
    color: colors.borderNeutral,
    fontSize: 12,
    lineHeight: 18,
  },
  groupParticipantList: {
    gap: 8,
    marginTop: 4,
  },
  groupParticipantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  groupParticipantRank: {
    width: 24,
    color: colors.brandLighter,
    fontSize: 13,
    fontWeight: '900',
  },
  groupParticipantCopy: {
    flex: 1,
    gap: 2,
  },
  groupParticipantName: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '900',
  },
  groupParticipantMeta: {
    color: colors.borderNeutral,
    fontSize: 11,
  },
});
