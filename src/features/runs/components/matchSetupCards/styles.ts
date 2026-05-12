import { StyleSheet } from 'react-native';

export const matchSetupCardStyles = StyleSheet.create({
  duelSetupCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#4F46E5',
    backgroundColor: '#111827',
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
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  distanceInputToggle: {
    borderRadius: 999,
    backgroundColor: '#1F2937',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  distanceInputToggleText: {
    color: '#C7D2FE',
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
    borderColor: '#374151',
    backgroundColor: '#1F2937',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  matchDistanceChipSelected: {
    borderColor: '#818CF8',
    backgroundColor: '#312E81',
  },
  matchDistanceChipText: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '800',
  },
  matchDistanceChipTextSelected: {
    color: '#FFFFFF',
  },
  duelDistanceInput: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#0B1220',
    color: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '700',
  },
  duelHelperText: {
    color: '#A5B4FC',
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
    borderColor: '#374151',
    backgroundColor: '#0B1220',
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  slotDateChipSelected: {
    borderColor: '#818CF8',
    backgroundColor: '#312E81',
  },
  slotDateChipLabel: {
    color: '#D1D5DB',
    fontSize: 13,
    fontWeight: '900',
  },
  slotDateChipLabelSelected: {
    color: '#FFFFFF',
  },
  slotDateChipMeta: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  slotDateChipMetaSelected: {
    color: '#C7D2FE',
  },
  slotSectionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  slotSectionChip: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#0B1220',
    paddingVertical: 9,
    alignItems: 'center',
  },
  slotSectionChipSelected: {
    borderColor: '#818CF8',
    backgroundColor: '#312E81',
  },
  slotSectionChipText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '900',
  },
  slotSectionChipTextSelected: {
    color: '#FFFFFF',
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
    borderColor: '#374151',
    backgroundColor: '#0B1220',
    paddingVertical: 10,
    alignItems: 'center',
    gap: 2,
  },
  duelSlotChipSelected: {
    borderColor: '#818CF8',
    backgroundColor: '#312E81',
  },
  duelSlotChipDisabled: {
    opacity: 0.45,
  },
  duelSlotLabel: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '900',
  },
  duelSlotLabelSelected: {
    color: '#FFFFFF',
  },
  duelSlotClosedText: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '800',
  },
  duelResultCard: {
    borderRadius: 16,
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#374151',
    padding: 14,
    gap: 7,
  },
  duelResultEyebrow: {
    color: '#C7D2FE',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  duelResultTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  duelResultMeta: {
    color: '#D1D5DB',
    fontSize: 12,
    lineHeight: 18,
  },
  matchCountdownPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#312E81',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  matchCountdownText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  matchNoticeBlock: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#818CF8',
    backgroundColor: '#1E1B4B',
    padding: 12,
    gap: 10,
  },
  matchNoticeText: {
    color: '#E0E7FF',
    fontSize: 12,
    lineHeight: 18,
  },
  matchNoticeAction: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  matchNoticeActionText: {
    color: '#4F46E5',
    fontSize: 12,
    fontWeight: '900',
  },
  matchCancelHelperText: {
    color: '#A5B4FC',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  matchActionColumn: {
    gap: 8,
  },
  matchDemandCard: {
    borderRadius: 16,
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#374151',
    padding: 14,
    gap: 8,
  },
  matchDemandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matchDemandTitle: {
    color: '#C7D2FE',
    fontSize: 12,
    fontWeight: '900',
  },
  matchDemandHeadline: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  matchDemandText: {
    color: '#D1D5DB',
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
    color: '#C7D2FE',
    fontSize: 13,
    fontWeight: '900',
  },
  groupParticipantCopy: {
    flex: 1,
    gap: 2,
  },
  groupParticipantName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  groupParticipantMeta: {
    color: '#D1D5DB',
    fontSize: 11,
  },
});
