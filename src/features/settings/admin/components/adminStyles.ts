import { StyleSheet } from 'react-native';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

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
    paddingHorizontal: spacing.s16,
    paddingTop: spacing.s18,
    gap: spacing.s16,
  },
  containerWide: {
    paddingHorizontal: spacing.s24,
  },
  hero: {
    backgroundColor: colors.textPrimary,
    borderRadius: 28,
    padding: spacing.s24,
    gap: spacing.s10,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.darkMuted,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.lg,
  },
  heroBadgeText: {
    color: colors.borderMuted,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
    letterSpacing: 0.6,
  },
  heroTitle: {
    color: colors.white,
    fontSize: fontSizes.authTitle,
    fontWeight: fontWeights.black,
  },
  heroSubtitle: {
    color: colors.border,
    fontSize: fontSizes.rank,
    lineHeight: 22,
  },
  heroMeta: {
    color: colors.textTertiary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  platformHint: {
    color: colors.purpleTextSoft,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.comingSoon,
    fontWeight: fontWeights.black,
  },
  sectionDescription: {
    color: colors.textSecondary,
    lineHeight: 21,
  },
  row: {
    gap: spacing.s12,
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
    gap: spacing.s10,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxl,
  },
  loadingText: {
    color: colors.textMuted,
    fontWeight: fontWeights.semibold,
  },
  errorText: {
    color: colors.danger,
    fontWeight: fontWeights.bold,
    lineHeight: 21,
  },
  successText: {
    color: colors.successStrong,
    fontWeight: fontWeights.bold,
    lineHeight: 21,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s12,
  },
  metricGridWide: {
    gap: spacing.s14,
  },
  metricCard: {
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: colors.surfaceSoft,
    borderRadius: radii.lg,
    padding: spacing.s16,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    gap: spacing.xxl,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.md,
  },
  metricValue: {
    color: colors.textPrimary,
    fontWeight: fontWeights.black,
    fontSize: fontSizes.pageTitle,
  },
  overviewMeta: {
    color: colors.textSecondary,
    fontWeight: fontWeights.semibold,
  },
  dashboardGrid: {
    gap: spacing.s16,
  },
  dashboardGridWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  primaryColumn: {
    flex: 1.2,
    gap: spacing.s16,
  },
  secondaryColumn: {
    flex: 1,
    gap: spacing.s16,
  },
  field: {
    gap: spacing.xxl,
    minWidth: 220,
  },
  fieldLabel: {
    color: colors.textStrongMuted,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.md,
  },
  input: {
    backgroundColor: colors.surfaceSubtleAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s14,
    color: colors.textPrimary,
  },
  textArea: {
    minHeight: 100,
  },
  formGrid: {
    gap: spacing.s12,
  },
  formGridTwoColumns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  formGridFull: {
    width: '100%',
  },
  listControls: {
    gap: spacing.s10,
  },
  searchInput: {
    backgroundColor: colors.surfaceSubtleAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.s14,
    paddingVertical: 13,
    color: colors.textPrimary,
  },
  filterSummary: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.s10,
    flexWrap: 'wrap',
  },
  toggleChip: {
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s10,
    borderRadius: radii.pill,
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
    fontWeight: fontWeights.bold,
  },
  toggleChipTextActive: {
    color: colors.white,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.s10,
    flexWrap: 'wrap',
  },
  actionButton: {
    backgroundColor: colors.textPrimary,
    borderRadius: radii.md,
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s14,
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
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.base,
  },
  actionButtonTextSecondary: {
    color: colors.textPrimary,
  },
  listStack: {
    gap: spacing.s12,
  },
  listCard: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: radii.lg,
    padding: spacing.s14,
    gap: spacing.xxl,
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
    gap: spacing.s12,
  },
  listHeaderTextWrap: {
    flex: 1,
    gap: spacing.sm,
  },
  listTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.large,
    fontWeight: fontWeights.black,
  },
  listMeta: {
    color: colors.textSecondary,
    fontWeight: fontWeights.bold,
  },
  listInfo: {
    color: colors.textMuted,
    lineHeight: 20,
  },
  inlineActions: {
    flexDirection: 'row',
    gap: spacing.xxl,
    flexWrap: 'wrap',
  },
  statusBadge: {
    backgroundColor: colors.brandWash,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.lg,
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
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.sm,
  },
  statusBadgeTextSuccess: {
    color: colors.successStrong,
  },
  statusBadgeTextMuted: {
    color: colors.textMuted,
  },
  emptyText: {
    color: colors.textSecondary,
    fontWeight: fontWeights.bold,
  },
});
