import { StyleSheet } from 'react-native';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

export const signupFormStyles = StyleSheet.create({
  form: { gap: 14 },
  inputGroup: { gap: 8 },
  privacyCard: {
    gap: spacing.md,
    padding: spacing.s14,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.indigoBorder,
  },
  privacyTitle: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
  },
  privacyText: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  displayNameCard: {
    gap: spacing.s10,
    padding: spacing.s14,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.indigoBorder,
  },
  displayNameOptionRow: {
    gap: spacing.s10,
  },
  displayNameOption: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: spacing.s14,
    gap: spacing.sm,
  },
  displayNameOptionSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brandWash,
  },
  displayNameOptionTitle: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.rank,
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
    gap: spacing.sm,
    padding: spacing.s14,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  displayNamePreviewLabel: {
    color: colors.textMuted,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.sm,
  },
  displayNamePreviewValue: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.title,
  },
  inlineInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s10,
  },
  label: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.rank,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s12,
  },
  inlineToggleText: {
    color: colors.brand,
    fontWeight: fontWeights.extraBold,
  },
  helperText: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  input: {
    backgroundColor: colors.surfaceSubtleAlt,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: radii.md,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s14,
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
    borderRadius: radii.md,
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionButtonText: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.base,
  },
  statusText: {
    fontWeight: fontWeights.bold,
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
    gap: spacing.xl,
  },
  validationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxl,
  },
  validationDot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
  },
  validationDotComplete: {
    backgroundColor: colors.success,
  },
  validationDotPending: {
    backgroundColor: colors.border,
  },
  validationText: {
    fontWeight: fontWeights.bold,
    lineHeight: 19,
  },
  validationTextComplete: {
    color: colors.successText,
  },
  validationTextPending: {
    color: colors.textSecondary,
  },
  readyCard: {
    gap: spacing.xxl,
    padding: spacing.s14,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceSubtleAlt,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  readyTitle: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
  },
  addressGroup: {
    gap: spacing.s12,
  },
  regionPickerCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.indigoBorder,
    backgroundColor: colors.surfaceSoft,
    overflow: 'hidden',
  },
  regionPickerHeader: {
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s12,
  },
  regionPickerHeaderCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  regionPickerTitle: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.base,
  },
  regionPickerValue: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  regionPickerToggle: {
    color: colors.brand,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
  },
  regionPickerContent: {
    paddingHorizontal: spacing.s14,
    paddingBottom: spacing.s14,
  },
  selectedAddressCard: {
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.indigoBorder,
    borderRadius: radii.md,
    padding: spacing.s14,
    gap: spacing.sm,
  },
  selectedAddressLabel: {
    color: colors.textMuted,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.sm,
  },
  selectedAddressValue: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
  },
  primaryButton: {
    backgroundColor: colors.brand,
    borderRadius: radii.lg,
    paddingVertical: spacing.s16,
    alignItems: 'center',
    marginTop: spacing.xxl,
  },
  primaryButtonText: {
    color: colors.white,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.button,
  },
  disabledButton: {
    opacity: 0.6,
  },
  errorText: {
    color: colors.danger,
    fontWeight: fontWeights.bold,
    lineHeight: 20,
  },
});
