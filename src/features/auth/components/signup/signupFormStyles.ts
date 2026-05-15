import { StyleSheet } from 'react-native';

export const signupFormStyles = StyleSheet.create({
  form: { gap: 14 },
  inputGroup: { gap: 8 },
  privacyCard: {
    gap: 5,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  privacyTitle: {
    color: '#111827',
    fontWeight: '800',
  },
  privacyText: {
    color: '#667085',
    lineHeight: 20,
  },
  displayNameCard: {
    gap: 10,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  displayNameOptionRow: {
    gap: 10,
  },
  displayNameOption: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 4,
  },
  displayNameOptionSelected: {
    borderColor: '#6D5EF7',
    backgroundColor: '#EEF2FF',
  },
  displayNameOptionTitle: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 15,
  },
  displayNameOptionTitleSelected: {
    color: '#4338CA',
  },
  displayNameOptionDescription: {
    color: '#667085',
    lineHeight: 19,
  },
  displayNameOptionDescriptionSelected: {
    color: '#5B4FCF',
  },
  displayNamePreviewCard: {
    gap: 4,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  displayNamePreviewLabel: {
    color: '#475467',
    fontWeight: '700',
    fontSize: 12,
  },
  displayNamePreviewValue: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 18,
  },
  inlineInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    color: '#111827',
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
    color: '#6D5EF7',
    fontWeight: '800',
  },
  helperText: {
    color: '#667085',
    lineHeight: 20,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: '#111827',
  },
  inputDisabled: {
    opacity: 0.7,
  },
  inlineInput: {
    flex: 1,
  },
  secondaryActionButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionButtonText: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 14,
  },
  statusText: {
    fontWeight: '700',
    lineHeight: 20,
  },
  statusTextSuccess: {
    color: '#067647',
  },
  statusTextNeutral: {
    color: '#475467',
  },
  statusTextError: {
    color: '#B42318',
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
    backgroundColor: '#12B76A',
  },
  validationDotPending: {
    backgroundColor: '#D0D5DD',
  },
  validationText: {
    fontWeight: '700',
    lineHeight: 19,
  },
  validationTextComplete: {
    color: '#067647',
  },
  validationTextPending: {
    color: '#667085',
  },
  readyCard: {
    gap: 8,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#EAECF0',
  },
  readyTitle: {
    color: '#111827',
    fontWeight: '800',
  },
  addressGroup: {
    gap: 12,
  },
  regionPickerCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
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
    color: '#111827',
    fontWeight: '800',
    fontSize: 14,
  },
  regionPickerValue: {
    color: '#667085',
    fontSize: 13,
    fontWeight: '600',
  },
  regionPickerToggle: {
    color: '#6D5EF7',
    fontSize: 13,
    fontWeight: '800',
  },
  regionPickerContent: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  selectedAddressCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  selectedAddressLabel: {
    color: '#475467',
    fontWeight: '700',
    fontSize: 12,
  },
  selectedAddressValue: {
    color: '#111827',
    fontWeight: '800',
  },
  primaryButton: {
    backgroundColor: '#6D5EF7',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  disabledButton: {
    opacity: 0.6,
  },
  errorText: {
    color: '#B42318',
    fontWeight: '700',
    lineHeight: 20,
  },
});
