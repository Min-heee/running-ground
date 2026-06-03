import { StyleSheet } from 'react-native';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

export const universityVerificationStyles = StyleSheet.create({
  statusCard: {
    gap: spacing.s12,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brandWash,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.xxl,
  },
  statusLabel: {
    color: colors.brandDeep,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.sm,
  },
  statusValue: {
    color: colors.textHeading,
    fontSize: fontSizes.comingSoon,
    fontWeight: fontWeights.extraBold,
  },
  statusHint: {
    color: colors.textSecondary,
    lineHeight: 21,
  },
  methodPickerCard: {
    gap: spacing.s12,
  },
  methodPickerRow: {
    flexDirection: 'row',
    gap: spacing.s10,
  },
  methodPickerButton: {
    flex: 1,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: spacing.s14,
    gap: spacing.sm,
  },
  methodPickerButtonSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brandWash,
  },
  methodPickerButtonTitle: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.rank,
  },
  methodPickerButtonTitleSelected: {
    color: colors.brandDeep,
  },
  methodPickerButtonSummary: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 18,
  },
  methodPickerButtonSummarySelected: {
    color: colors.brandMuted,
  },
  formCard: {
    gap: spacing.s12,
  },
  methodSummary: {
    color: colors.textSecondary,
    lineHeight: 21,
  },
  inputGroup: {
    gap: spacing.xxl,
  },
  inputLabel: {
    color: colors.textPrimary,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.bold,
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
  suggestionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxl,
  },
  suggestionChip: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s12,
    paddingVertical: 9,
  },
  suggestionChipSelected: {
    backgroundColor: colors.brandWash,
    borderColor: colors.brand,
  },
  suggestionChipText: {
    color: colors.textStrongMuted,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.md,
  },
  suggestionChipTextSelected: {
    color: colors.brandDeep,
  },
  checkRowWrap: {
    gap: spacing.s10,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s10,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: radii.md,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s14,
    backgroundColor: colors.white,
  },
  checkRowSelected: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.brand,
  },
  checkMark: {
    width: 18,
    height: 18,
    borderRadius: radii.pill,
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
    fontWeight: fontWeights.bold,
    lineHeight: 20,
  },
  readinessCard: {
    gap: spacing.sm,
    padding: spacing.s14,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.indigoBorder,
  },
  readinessTitle: {
    color: colors.textMuted,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.sm,
  },
  readinessValue: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.metric,
  },
  readinessHint: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  previewCard: {
    gap: spacing.s10,
  },
  previewHint: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  methodCard: {
    gap: spacing.s12,
  },
  stepList: {
    gap: spacing.s10,
  },
  stepRow: {
    flexDirection: 'row',
    gap: spacing.s10,
    alignItems: 'flex-start',
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: radii.pill,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xxxs,
  },
  stepDotText: {
    color: colors.white,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
  },
  stepText: {
    flex: 1,
    color: colors.textStrongMuted,
    lineHeight: 20,
  },
  errorText: {
    color: colors.danger,
    fontWeight: fontWeights.bold,
    lineHeight: 20,
  },
});
