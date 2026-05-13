import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F3F5F9',
  },
  scrollContent: {
    paddingBottom: 48,
  },
  container: {
    width: '100%',
    maxWidth: 1320,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 18,
    gap: 16,
  },
  containerWide: {
    paddingHorizontal: 24,
  },
  hero: {
    backgroundColor: '#111827',
    borderRadius: 28,
    padding: 24,
    gap: 10,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#1F2937',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  heroBadgeText: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
  },
  heroSubtitle: {
    color: '#D0D5DD',
    fontSize: 15,
    lineHeight: 22,
  },
  heroMeta: {
    color: '#98A2B3',
    fontSize: 13,
    fontWeight: '600',
  },
  platformHint: {
    color: '#EDE9FE',
    fontSize: 13,
    fontWeight: '600',
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '900',
  },
  sectionDescription: {
    color: '#667085',
    lineHeight: 21,
  },
  row: {
    gap: 12,
  },
  rowInline: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  flexField: {
    flex: 1,
  },
  tokenActions: {
    minWidth: 220,
    gap: 10,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: '#475467',
    fontWeight: '600',
  },
  errorText: {
    color: '#B42318',
    fontWeight: '700',
    lineHeight: 21,
  },
  successText: {
    color: '#027A48',
    fontWeight: '700',
    lineHeight: 21,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricGridWide: {
    gap: 14,
  },
  metricCard: {
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  metricLabel: {
    color: '#667085',
    fontWeight: '700',
    fontSize: 13,
  },
  metricValue: {
    color: '#111827',
    fontWeight: '900',
    fontSize: 28,
  },
  overviewMeta: {
    color: '#667085',
    fontWeight: '600',
  },
  dashboardGrid: {
    gap: 16,
  },
  dashboardGridWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  primaryColumn: {
    flex: 1.2,
    gap: 16,
  },
  secondaryColumn: {
    flex: 1,
    gap: 16,
  },
  field: {
    gap: 8,
    minWidth: 220,
  },
  fieldLabel: {
    color: '#344054',
    fontWeight: '800',
    fontSize: 13,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: '#111827',
  },
  textArea: {
    minHeight: 100,
  },
  formGrid: {
    gap: 12,
  },
  formGridTwoColumns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  formGridFull: {
    width: '100%',
  },
  listControls: {
    gap: 10,
  },
  searchInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#111827',
  },
  filterSummary: {
    color: '#667085',
    fontSize: 13,
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  toggleChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  toggleChipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  toggleChipText: {
    color: '#344054',
    fontWeight: '700',
  },
  toggleChipTextActive: {
    color: '#FFFFFF',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  actionButton: {
    backgroundColor: '#111827',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 110,
  },
  actionButtonSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D0D5DD',
  },
  actionButtonDanger: {
    backgroundColor: '#B42318',
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  actionButtonTextSecondary: {
    color: '#111827',
  },
  listStack: {
    gap: 12,
  },
  listCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  listSeparator: {
    height: 12,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  listHeaderTextWrap: {
    flex: 1,
    gap: 4,
  },
  listTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '900',
  },
  listMeta: {
    color: '#667085',
    fontWeight: '700',
  },
  listInfo: {
    color: '#475467',
    lineHeight: 20,
  },
  inlineActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  statusBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  statusBadgeSuccess: {
    backgroundColor: '#ECFDF3',
  },
  statusBadgeMuted: {
    backgroundColor: '#F2F4F7',
  },
  statusBadgeText: {
    color: '#4338CA',
    fontWeight: '800',
    fontSize: 12,
  },
  statusBadgeTextSuccess: {
    color: '#027A48',
  },
  statusBadgeTextMuted: {
    color: '#475467',
  },
  emptyText: {
    color: '#667085',
    fontWeight: '700',
  },
});
