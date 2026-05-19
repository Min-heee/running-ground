import { StyleSheet } from 'react-native';
import { colors } from '@/theme/tokens';

export const nrcBridgeGuideSectionStyles = StyleSheet.create({
  group: {
    gap: 12,
  },
});

export const nrcBridgeGuideDetailStyles = StyleSheet.create({
  card: {
    gap: 14,
  },
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  accordionMeta: {
    alignItems: 'flex-end',
    gap: 8,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  kicker: {
    color: colors.textNeutral,
    fontWeight: '700',
    fontSize: 12,
  },
  title: {
    color: colors.textHeading,
    fontWeight: '800',
    fontSize: 20,
    lineHeight: 28,
  },
  toggleText: {
    color: colors.textNeutral,
    fontSize: 12,
    fontWeight: '800',
  },
  badge: {
    backgroundColor: colors.brandWash,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  badgeText: {
    color: colors.brandStrong,
    fontWeight: '800',
    fontSize: 12,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusChip: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 96,
    gap: 2,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  statusValue: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textHeading,
  },
  steps: {
    gap: 10,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  stepMarker: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.brandWash,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stepMarkerText: {
    color: colors.brandStrong,
    fontWeight: '800',
    fontSize: 12,
  },
  stepCopy: {
    flex: 1,
    gap: 2,
  },
  stepTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  stepDescription: {
    color: colors.textMuted,
    lineHeight: 20,
  },
  actions: {
    gap: 10,
  },
  footnote: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
});
