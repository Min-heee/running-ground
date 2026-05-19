import { StyleSheet } from 'react-native';
import { colors } from '@/theme/tokens';

export const signupFormStyles = StyleSheet.create({
  form: { gap: 14 },
  inputGroup: { gap: 8 },
  privacyCard: {
    gap: 5,
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.indigoBorder,
  },
  privacyTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  privacyText: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  displayNameCard: {
    gap: 10,
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.indigoBorder,
  },
  displayNameOptionRow: {
    gap: 10,
  },
  displayNameOption: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: 14,
    gap: 4,
  },
  displayNameOptionSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brandWash,
  },
  displayNameOptionTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 15,
  },
  displayNameOptionTitleSelected: {
    color: colors.brandDeep,
  },
  displayNameOptionDescription: {
    color: colors.textSecondary,
    lineHeight: 19,
  },
  displayNameOptionDescriptionSelected: {
    color: colors.brandMuted,
  },
  displayNamePreviewCard: {
    gap: 4,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  displayNamePreviewLabel: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 12,
  },
  displayNamePreviewValue: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 18,
  },
  inlineInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  inlineToggleText: {
    color: colors.brand,
    fontWeight: '800',
  },
  helperText: {
    color: colors.textSecondary,
    lineHeight: 20,
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
  inputDisabled: {
    opacity: 0.7,
  },
  inlineInput: {
    flex: 1,
  },
  secondaryActionButton: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionButtonText: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 14,
  },
  statusText: {
    fontWeight: '700',
    lineHeight: 20,
  },
  statusTextSuccess: {
    color: colors.successText,
  },
  statusTextNeutral: {
    color: colors.textMuted,
  },
  statusTextError: {
    color: colors.danger,
  },
  validationList: {
    gap: 7,
  },
  validationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  validationDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  validationDotComplete: {
    backgroundColor: colors.success,
  },
  validationDotPending: {
    backgroundColor: colors.border,
  },
  validationText: {
    fontWeight: '700',
    lineHeight: 19,
  },
  validationTextComplete: {
    color: colors.successText,
  },
  validationTextPending: {
    color: colors.textSecondary,
  },
  readyCard: {
    gap: 8,
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.surfaceSubtleAlt,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  readyTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  addressGroup: {
    gap: 12,
  },
  regionPickerCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.indigoBorder,
    backgroundColor: colors.surfaceSoft,
    overflow: 'hidden',
  },
  regionPickerHeader: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  regionPickerHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  regionPickerTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 14,
  },
  regionPickerValue: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  regionPickerToggle: {
    color: colors.brand,
    fontSize: 13,
    fontWeight: '800',
  },
  regionPickerContent: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  selectedAddressCard: {
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.indigoBorder,
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  selectedAddressLabel: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 12,
  },
  selectedAddressValue: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  primaryButton: {
    backgroundColor: colors.brand,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 16,
  },
  disabledButton: {
    opacity: 0.6,
  },
  errorText: {
    color: colors.danger,
    fontWeight: '700',
    lineHeight: 20,
  },
});
