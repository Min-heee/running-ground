import { StyleSheet } from 'react-native';
import { colors } from '@/theme/tokens';

export const universityVerificationStyles = StyleSheet.create({
  statusCard: {
    gap: 12,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brandWash,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusLabel: {
    color: colors.brandDeep,
    fontWeight: '800',
    fontSize: 12,
  },
  statusValue: {
    color: colors.textHeading,
    fontSize: 22,
    fontWeight: '800',
  },
  statusHint: {
    color: colors.textSecondary,
    lineHeight: 21,
  },
  methodPickerCard: {
    gap: 12,
  },
  methodPickerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  methodPickerButton: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: 14,
    gap: 4,
  },
  methodPickerButtonSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brandWash,
  },
  methodPickerButtonTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 15,
  },
  methodPickerButtonTitleSelected: {
    color: colors.brandDeep,
  },
  methodPickerButtonSummary: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  methodPickerButtonSummarySelected: {
    color: colors.brandMuted,
  },
  formCard: {
    gap: 12,
  },
  methodSummary: {
    color: colors.textSecondary,
    lineHeight: 21,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  input: {
    backgroundColor: colors.surfaceSubtleAlt,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: colors.textPrimary,
  },
  suggestionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  suggestionChipSelected: {
    backgroundColor: colors.brandWash,
    borderColor: colors.brand,
  },
  suggestionChipText: {
    color: colors.textStrongMuted,
    fontWeight: '700',
    fontSize: 13,
  },
  suggestionChipTextSelected: {
    color: colors.brandDeep,
  },
  checkRowWrap: {
    gap: 10,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: colors.white,
  },
  checkRowSelected: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.brand,
  },
  checkMark: {
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  checkMarkSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brand,
  },
  checkText: {
    flex: 1,
    color: colors.textStrongMuted,
    fontWeight: '700',
    lineHeight: 20,
  },
  readinessCard: {
    gap: 4,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.indigoBorder,
  },
  readinessTitle: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 12,
  },
  readinessValue: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 20,
  },
  readinessHint: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  previewCard: {
    gap: 10,
  },
  previewHint: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  methodCard: {
    gap: 12,
  },
  stepList: {
    gap: 10,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepDotText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '800',
  },
  stepText: {
    flex: 1,
    color: colors.textStrongMuted,
    lineHeight: 20,
  },
  errorText: {
    color: colors.danger,
    fontWeight: '700',
    lineHeight: 20,
  },
});
