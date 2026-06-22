import { StyleSheet } from 'react-native';
import { USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI } from '@/components/matches/liveMatchArena/config';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';
import {
  GROUP_LIST_BOTTOM_INSET,
  GROUP_LIST_TOP_INSET,
  GROUP_ROW_HEIGHT,
  ROAD_STRIPE_HEIGHT,
  ROAD_STRIPE_SPACING,
} from '@/components/matches/liveMatchArena/helpers';

export const liveMatchArenaStyles = StyleSheet.create({
  card: {
    gap: spacing.s10,
    borderRadius: 28,
    borderWidth: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? 0 : 1,
    borderColor: colors.navyBorder,
    backgroundColor: colors.slateDark,
    padding: spacing.s16,
  },
  eyebrow: {
    color: colors.brandLighter,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
    letterSpacing: 0.8,
  },
  title: {
    color: colors.white,
    fontSize: fontSizes.summaryValue,
    fontWeight: fontWeights.extraBold,
  },
  subtitle: {
    color: colors.border,
    fontSize: fontSizes.base,
    lineHeight: 20,
  },
  summaryChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxl,
  },
  summaryChip: {
    borderRadius: radii.pill,
    backgroundColor: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? colors.slatePanel : 'rgba(255,255,255,0.12)',
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.lg,
  },
  summaryChipText: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  roadCard: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 28,
    borderWidth: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? 0 : 1,
    borderColor: colors.indigoDeep,
    backgroundColor: colors.navyInk,
  },
  startupRoadShell: {
    minHeight: 220,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navyInk,
  },
  roadBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  duelRoadBase: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '1%',
    width: '98%',
    borderRadius: 24,
    backgroundColor: colors.night,
  },
  duelCenterDivider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '48%',
    width: '4%',
    backgroundColor: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? colors.navyStrong : 'rgba(44, 67, 160, 0.38)',
  },
  duelLaneBase: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '47%',
    borderRadius: 22,
    backgroundColor: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? colors.midnight : 'rgba(255,255,255,0.02)',
  },
  duelLaneLeft: {
    left: '1%',
  },
  duelLaneRight: {
    right: '1%',
  },
  duelCenterMarkingsWrap: {
    position: 'absolute',
    top: -ROAD_STRIPE_SPACING,
    left: '22%',
    right: '22%',
  },
  duelStripeRow: {
    height: ROAD_STRIPE_SPACING,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 0,
  },
  duelStripe: {
    width: 10,
    height: ROAD_STRIPE_HEIGHT,
    borderRadius: radii.pill,
    backgroundColor: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? colors.slateSoft : 'rgba(255,255,255,0.18)',
  },
  groupRoadBase: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: 28,
    backgroundColor: colors.navySurface,
    borderWidth: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? 0 : 1,
    borderColor: 'rgba(199,210,254,0.14)',
  },
  groupCenterMarkingsWrap: {
    position: 'absolute',
    top: -ROAD_STRIPE_SPACING,
    left: '49%',
    marginLeft: -4,
  },
  groupStripe: {
    width: 8,
    height: ROAD_STRIPE_HEIGHT,
    marginBottom: ROAD_STRIPE_SPACING - ROAD_STRIPE_HEIGHT,
    borderRadius: radii.pill,
    backgroundColor: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? colors.slateMutedDeep : 'rgba(255,255,255,0.16)',
  },
  finishRibbon: {
    position: 'absolute',
    top: spacing.s14,
    left: spacing.s10,
    right: spacing.s10,
    borderRadius: radii.pill,
    backgroundColor: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? colors.purpleDeep : 'rgba(109,94,247,0.24)',
    borderWidth: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? 0 : 1,
    borderColor: 'rgba(224,231,255,0.18)',
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  finishRibbonGroup: {
    top: spacing.s10,
  },
  finishRibbonText: {
    color: colors.white,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
    letterSpacing: 1.4,
  },
  duelRunnerWrap: {
    position: 'absolute',
    alignItems: 'center',
    width: 96,
    marginLeft: -48,
  },
  duelRunnerLeft: {
    left: '24%',
  },
  duelRunnerRight: {
    left: '76%',
  },
  runnerBubble: {
    marginTop: spacing.xl,
    borderRadius: radii.pill,
    backgroundColor: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? colors.slateDeep : 'rgba(255,255,255,0.14)',
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.md,
  },
  runnerBubbleCurrent: {
    backgroundColor: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? colors.indigoMuted : 'rgba(129, 140, 248, 0.32)',
  },
  runnerBubbleText: {
    color: colors.white,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
  },
  runnerBubbleForfeitedText: {
    color: colors.dangerWash,
  },
  runnerMarker: {
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? 1 : 2,
  },
  duelRunnerTokenWrap: {
    position: 'relative',
    alignItems: 'center',
  },
  duelRunnerResultBadge: {
    position: 'absolute',
    top: -spacing.xxl,
    right: -spacing.s20,
    zIndex: 2,
  },
  resultBadge: {
    minWidth: 42,
    borderRadius: radii.pill,
    borderWidth: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? 0 : 1,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xxs,
    alignItems: 'center',
  },
  resultBadgeWin: {
    backgroundColor: colors.success,
    borderColor: colors.successWash,
  },
  resultBadgeLose: {
    backgroundColor: colors.dangerVivid,
    borderColor: colors.dangerBorder,
  },
  resultBadgeDraw: {
    backgroundColor: colors.textNeutral,
    borderColor: colors.border,
  },
  resultBadgeText: {
    color: colors.white,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.extraBold,
    letterSpacing: 0.4,
  },
  runnerMarkerCurrent: {
    backgroundColor: colors.brand,
    borderColor: colors.brandWashStrong,
  },
  runnerMarkerOpponent: {
    backgroundColor: colors.darkMuted,
    borderColor: colors.podiumSilver,
  },
  runnerMarkerLeader: {
    backgroundColor: colors.podiumGold,
    borderColor: colors.warningSoft,
  },
  runnerMarkerForfeited: {
    backgroundColor: colors.dangerVivid,
    borderColor: colors.dangerBorder,
  },
  runnerMarkerText: {
    color: colors.white,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  runnerMarkerForfeitedText: {
    fontSize: fontSizes.md,
    letterSpacing: -0.2,
  },
  runnerName: {
    marginTop: spacing.xxl,
    color: colors.white,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  runnerNameForfeited: {
    color: colors.dangerBorder,
  },
  runnerBubbleForfeited: {
    backgroundColor: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? colors.dangerDeep : 'rgba(220,38,38,0.36)',
  },
  runnerMeta: {
    marginTop: spacing.xxs,
    color: colors.brandLighter,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  runnerMetaForfeited: {
    color: colors.dangerLight,
  },
  runnerMetaMuted: {
    marginTop: spacing.xxs,
    color: colors.textTertiary,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.bold,
  },
  groupScroll: {
    flex: 1,
  },
  groupScrollContent: {
    paddingTop: GROUP_LIST_TOP_INSET,
    paddingBottom: GROUP_LIST_BOTTOM_INSET,
  },
  groupRow: {
    height: GROUP_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s10,
    gap: spacing.lg,
  },
  groupRowCurrent: {
    backgroundColor: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? colors.lightweightMatchBlue : 'rgba(109,94,247,0.14)',
  },
  groupRowForfeited: {
    backgroundColor: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? colors.lightweightMatchRed : 'rgba(220,38,38,0.12)',
  },
  groupRankColumn: {
    width: '16%',
    gap: spacing.xxs,
  },
  groupRankColumnCurrentFinished: {
    borderRadius: radii.sm,
    backgroundColor: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? colors.purpleDeep : 'rgba(109,94,247,0.24)',
  },
  groupRankText: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  groupRankTextCurrentFinished: {
    color: colors.warningBright,
  },
  groupNameText: {
    color: colors.brandLighter,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  groupRoadLane: {
    width: '54%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupRunnerMarker: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? 1 : 2,
  },
  groupRunnerMarkerText: {
    color: colors.white,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
  },
  groupRunnerMarkerForfeitedText: {
    fontSize: 9,
    letterSpacing: -0.4,
  },
  groupMetaColumn: {
    width: '20%',
    alignItems: 'flex-end',
    gap: spacing.xxs,
  },
  groupMetaText: {
    color: colors.white,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
  },
  groupMetaForfeitedText: {
    color: colors.dangerBorder,
  },
  groupMetaSubtext: {
    color: colors.textTertiary,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.bold,
  },
  footer: {
    color: colors.textTertiary,
    fontSize: fontSizes.sm,
    lineHeight: 18,
  },
});
