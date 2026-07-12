import { StyleSheet } from 'react-native';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

// Screen-level styles shared by DuelReservationRoomScreen and
// GroupReservationRoomScreen. The two screens shipped byte-identical values for
// every one of these keys; the participant-row/badge styles (the only keys whose
// NAMES differed) live with the shared components in ReservationRoomShared.

export const reservationRoomScreenStyles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  pageTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.pageTitle,
    fontWeight: fontWeights.black,
  },
  summaryCard: {
    gap: spacing.s14,
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.s12,
  },
  summaryHeading: {
    flex: 1,
    gap: spacing.xxs,
  },
  summaryModeTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.summaryValue,
    fontWeight: fontWeights.black,
  },
  summaryMeta: {
    color: colors.textMuted,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
  },
  statusPill: {
    borderRadius: radii.pill,
    backgroundColor: colors.indigoInk,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.xxl,
  },
  statusPillText: {
    color: colors.brandWashStrong,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
  },
  autoStartNotice: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 20,
  },
  helperText: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 20,
  },
  cancelHelperText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 18,
    textAlign: 'center',
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  errorText: {
    color: colors.dangerBright,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
});
