import { StyleSheet } from 'react-native';
import { colors } from '@/theme/tokens';

export const liveMatchTrackingStyles = StyleSheet.create({
  mapCard: {
    gap: 14,
    backgroundColor: colors.textPrimary,
  },
  liveMatchCard: {
    gap: 5,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.darkSoft,
    backgroundColor: colors.darkMuted,
  },
  liveMatchEyebrow: {
    color: colors.brandLighter,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  liveMatchTitle: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '800',
  },
  liveMatchText: {
    color: colors.border,
    lineHeight: 20,
  },
  groupLiveCard: {
    gap: 12,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.indigoDeep,
    backgroundColor: colors.textPrimary,
  },
  duelLiveCard: {
    gap: 12,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.blueStrong,
    backgroundColor: colors.slateDark,
  },
  duelLiveHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  duelLiveBadge: {
    borderRadius: 999,
    backgroundColor: colors.blueInk,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  duelLiveBadgeText: {
    color: colors.blueWash,
    fontSize: 11,
    fontWeight: '800',
  },
  matchStatusBanner: {
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  matchStatusBannerNeutral: {
    backgroundColor: 'rgba(148, 163, 184, 0.10)',
    borderColor: 'rgba(148, 163, 184, 0.18)',
  },
  matchStatusBannerWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.22)',
  },
  matchStatusBannerDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.22)',
  },
  matchStatusBannerTitle: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  matchStatusBannerText: {
    color: colors.border,
    fontSize: 12,
    lineHeight: 18,
  },
  matchStatusBannerAction: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  matchStatusBannerActionText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  groupLiveHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  groupLiveHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  groupLiveTitle: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '800',
  },
  groupLiveSummary: {
    color: colors.border,
    lineHeight: 20,
  },
  groupLiveGapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  groupLiveGapChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(129, 140, 248, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.22)',
  },
  groupLiveGapEyebrow: {
    color: colors.brandLighter,
    fontSize: 10,
    fontWeight: '800',
  },
  groupLiveGapText: {
    color: colors.surfaceSubtleAlt,
    fontSize: 12,
    fontWeight: '800',
  },
  groupLiveBadge: {
    borderRadius: 999,
    backgroundColor: colors.indigoStrong,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  groupLiveBadgeText: {
    color: colors.brandWash,
    fontSize: 11,
    fontWeight: '800',
  },
  groupLiveTopList: {
    gap: 8,
  },
  groupLiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  groupLiveRowCurrent: {
    backgroundColor: 'rgba(109, 94, 247, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.45)',
  },
  groupLiveRank: {
    width: 24,
    color: colors.brandLighter,
    fontWeight: '800',
  },
  groupLiveCopy: {
    flex: 1,
    gap: 2,
  },
  groupLiveName: {
    color: colors.white,
    fontWeight: '800',
  },
  groupLiveMeta: {
    color: colors.border,
    fontSize: 12,
    lineHeight: 17,
  },
  groupLiveDistance: {
    color: colors.white,
    fontWeight: '800',
  },
  groupLiveFooter: {
    color: colors.border,
    lineHeight: 20,
  },
});
