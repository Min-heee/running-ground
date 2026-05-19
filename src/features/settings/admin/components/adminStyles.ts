import { StyleSheet } from 'react-native';
import { colors } from '@/theme/tokens';

export const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.adminSurface,
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
    backgroundColor: colors.textPrimary,
    borderRadius: 28,
    padding: 24,
    gap: 10,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.darkMuted,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  heroBadgeText: {
    color: colors.borderMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  heroTitle: {
    color: colors.white,
    fontSize: 32,
    fontWeight: '900',
  },
  heroSubtitle: {
    color: colors.border,
    fontSize: 15,
    lineHeight: 22,
  },
  heroMeta: {
    color: colors.textTertiary,
    fontSize: 13,
    fontWeight: '600',
  },
  platformHint: {
    color: colors.purpleTextSoft,
    fontSize: 13,
    fontWeight: '600',
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '900',
  },
  sectionDescription: {
    color: colors.textSecondary,
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
    color: colors.textMuted,
    fontWeight: '600',
  },
  errorText: {
    color: colors.danger,
    fontWeight: '700',
    lineHeight: 21,
  },
  successText: {
    color: colors.successStrong,
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
    backgroundColor: colors.surfaceSoft,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    gap: 8,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 13,
  },
  metricValue: {
    color: colors.textPrimary,
    fontWeight: '900',
    fontSize: 28,
  },
  overviewMeta: {
    color: colors.textSecondary,
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
    color: colors.textStrongMuted,
    fontWeight: '800',
    fontSize: 13,
  },
  input: {
    backgroundColor: colors.surfaceSubtleAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: colors.textPrimary,
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
    backgroundColor: colors.surfaceSubtleAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: colors.textPrimary,
  },
  filterSummary: {
    color: colors.textSecondary,
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
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  toggleChipActive: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  toggleChipText: {
    color: colors.textStrongMuted,
    fontWeight: '700',
  },
  toggleChipTextActive: {
    color: colors.white,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  actionButton: {
    backgroundColor: colors.textPrimary,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 110,
  },
  actionButtonSecondary: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionButtonDanger: {
    backgroundColor: colors.danger,
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  actionButtonText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 14,
  },
  actionButtonTextSecondary: {
    color: colors.textPrimary,
  },
  listStack: {
    gap: 12,
  },
  listCard: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: 18,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.borderMuted,
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
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '900',
  },
  listMeta: {
    color: colors.textSecondary,
    fontWeight: '700',
  },
  listInfo: {
    color: colors.textMuted,
    lineHeight: 20,
  },
  inlineActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  statusBadge: {
    backgroundColor: colors.brandWash,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  statusBadgeSuccess: {
    backgroundColor: colors.successCard,
  },
  statusBadgeMuted: {
    backgroundColor: colors.surfaceMuted,
  },
  statusBadgeText: {
    color: colors.brandDeep,
    fontWeight: '800',
    fontSize: 12,
  },
  statusBadgeTextSuccess: {
    color: colors.successStrong,
  },
  statusBadgeTextMuted: {
    color: colors.textMuted,
  },
  emptyText: {
    color: colors.textSecondary,
    fontWeight: '700',
  },
});
