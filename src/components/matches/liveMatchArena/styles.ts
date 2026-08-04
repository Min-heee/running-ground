import { StyleSheet } from 'react-native';
import { USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI } from '@/components/matches/liveMatchArena/config';
import { colors, fixedColors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';
import {
  ROAD_STRIPE_HEIGHT,
  ROAD_STRIPE_SPACING,
  TOWER_LIST_VERTICAL_INSET,
  TOWER_ROW_HEIGHT,
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
    color: fixedColors.border,
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
    color: fixedColors.dangerWash,
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
    borderColor: fixedColors.successWash,
  },
  resultBadgeLose: {
    backgroundColor: colors.dangerVivid,
    borderColor: colors.dangerBorder,
  },
  resultBadgeDraw: {
    backgroundColor: fixedColors.textNeutral,
    borderColor: fixedColors.border,
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
  groupScroll: {
    flex: 1,
  },
  towerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s16,
    paddingTop: spacing.s14,
    paddingBottom: spacing.sm,
  },
  towerHeaderLabel: {
    color: colors.lavenderSoft,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  towerToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? colors.lightweightMatchBlue : 'rgba(255,255,255,0.08)',
    borderRadius: radii.sm,
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.sm,
  },
  towerToggleLabel: {
    color: colors.lavenderSoft,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  towerToggleLabelActive: {
    color: colors.brandLighter,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
  },
  towerScrollContent: {
    paddingVertical: TOWER_LIST_VERTICAL_INSET,
    paddingHorizontal: spacing.s10,
  },
  towerRow: {
    height: TOWER_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s10,
    paddingHorizontal: spacing.s12,
    borderRadius: radii.md,
  },
  towerRowCurrent: {
    backgroundColor: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? colors.lightweightMatchBlue : 'rgba(109,94,247,0.2)',
  },
  towerRowForfeited: {
    opacity: 0.55,
  },
  towerRank: {
    width: 26,
    color: colors.white,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.black,
    textAlign: 'center',
  },
  towerShiftSlot: {
    width: 14,
    alignItems: 'center',
  },
  towerShiftUp: {
    color: colors.successBright,
    fontSize: fontSizes.xs,
  },
  towerShiftDown: {
    color: colors.dangerBorder,
    fontSize: fontSizes.xs,
  },
  towerColorBar: {
    width: 4,
    height: 26,
    borderRadius: radii.pill,
  },
  towerName: {
    flex: 1,
    color: colors.white,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  towerNameCurrent: {
    flex: 1,
    color: colors.brandLighter,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  towerGap: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
    fontVariant: ['tabular-nums'],
  },
  towerGapCurrent: {
    color: colors.brandLighter,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
    fontVariant: ['tabular-nums'],
  },
  footer: {
    color: fixedColors.textTertiary,
    fontSize: fontSizes.sm,
    lineHeight: 18,
  },
});
