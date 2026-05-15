import { StyleSheet } from 'react-native';

export const universityVerificationStyles = StyleSheet.create({
  statusCard: {
    gap: 12,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusLabel: {
    color: '#4338CA',
    fontWeight: '800',
    fontSize: 12,
  },
  statusValue: {
    color: '#101828',
    fontSize: 22,
    fontWeight: '800',
  },
  statusHint: {
    color: '#667085',
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
    borderColor: '#D0D5DD',
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 4,
  },
  methodPickerButtonSelected: {
    borderColor: '#6D5EF7',
    backgroundColor: '#EEF2FF',
  },
  methodPickerButtonTitle: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 15,
  },
  methodPickerButtonTitleSelected: {
    color: '#4338CA',
  },
  methodPickerButtonSummary: {
    color: '#667085',
    fontSize: 12,
    lineHeight: 18,
  },
  methodPickerButtonSummarySelected: {
    color: '#5B4FCF',
  },
  formCard: {
    gap: 12,
  },
  methodSummary: {
    color: '#667085',
    lineHeight: 21,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
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
  suggestionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  suggestionChipSelected: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6D5EF7',
  },
  suggestionChipText: {
    color: '#344054',
    fontWeight: '700',
    fontSize: 13,
  },
  suggestionChipTextSelected: {
    color: '#4338CA',
  },
  checkRowWrap: {
    gap: 10,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
  },
  checkRowSelected: {
    backgroundColor: '#F8FAFC',
    borderColor: '#6D5EF7',
  },
  checkMark: {
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#D0D5DD',
    backgroundColor: '#FFFFFF',
  },
  checkMarkSelected: {
    borderColor: '#6D5EF7',
    backgroundColor: '#6D5EF7',
  },
  checkText: {
    flex: 1,
    color: '#344054',
    fontWeight: '700',
    lineHeight: 20,
  },
  readinessCard: {
    gap: 4,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  readinessTitle: {
    color: '#475467',
    fontWeight: '700',
    fontSize: 12,
  },
  readinessValue: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 20,
  },
  readinessHint: {
    color: '#667085',
    lineHeight: 20,
  },
  previewCard: {
    gap: 10,
  },
  previewHint: {
    color: '#667085',
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
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepDotText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  stepText: {
    flex: 1,
    color: '#344054',
    lineHeight: 20,
  },
  errorText: {
    color: '#B42318',
    fontWeight: '700',
    lineHeight: 20,
  },
});
