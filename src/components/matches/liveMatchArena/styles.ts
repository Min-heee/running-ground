import { StyleSheet } from 'react-native';
import {
  GROUP_ROW_HEIGHT,
  ROAD_STRIPE_HEIGHT,
  ROAD_STRIPE_SPACING,
  USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI,
} from '@/components/matches/liveMatchArena/helpers';

export const liveMatchArenaStyles = StyleSheet.create({
  card: {
    gap: 10,
    borderRadius: 28,
    borderWidth: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? 0 : 1,
    borderColor: '#1F2A44',
    backgroundColor: '#0F172A',
    padding: 16,
  },
  eyebrow: {
    color: '#C7D2FE',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    color: '#D0D5DD',
    fontSize: 14,
    lineHeight: 20,
  },
  summaryChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryChip: {
    borderRadius: 999,
    backgroundColor: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? '#2A3347' : 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  summaryChipText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  roadCard: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 28,
    borderWidth: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? 0 : 1,
    borderColor: '#312E81',
    backgroundColor: '#091122',
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
    backgroundColor: '#0B1020',
  },
  duelCenterDivider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '48%',
    width: '4%',
    backgroundColor: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? '#1D2F67' : 'rgba(44, 67, 160, 0.38)',
  },
  duelLaneBase: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '47%',
    borderRadius: 22,
    backgroundColor: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? '#0C1324' : 'rgba(255,255,255,0.02)',
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
    borderRadius: 999,
    backgroundColor: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? '#374158' : 'rgba(255,255,255,0.18)',
  },
  groupRoadBase: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: 28,
    backgroundColor: '#101A31',
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
    borderRadius: 999,
    backgroundColor: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? '#3A435A' : 'rgba(255,255,255,0.16)',
  },
  finishRibbon: {
    position: 'absolute',
    top: 14,
    left: 10,
    right: 10,
    borderRadius: 999,
    backgroundColor: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? '#2E2A67' : 'rgba(109,94,247,0.24)',
    borderWidth: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? 0 : 1,
    borderColor: 'rgba(224,231,255,0.18)',
    paddingVertical: 8,
    alignItems: 'center',
  },
  finishRibbonGroup: {
    top: 10,
  },
  finishRibbonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
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
    marginTop: 7,
    borderRadius: 999,
    backgroundColor: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? '#30394C' : 'rgba(255,255,255,0.14)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  runnerBubbleCurrent: {
    backgroundColor: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? '#353474' : 'rgba(129, 140, 248, 0.32)',
  },
  runnerBubbleText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  runnerBubbleForfeitedText: {
    color: '#FEE2E2',
  },
  runnerMarker: {
    width: 56,
    height: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? 1 : 2,
  },
  runnerMarkerCurrent: {
    backgroundColor: '#6D5EF7',
    borderColor: '#E0E7FF',
  },
  runnerMarkerOpponent: {
    backgroundColor: '#1F2937',
    borderColor: '#94A3B8',
  },
  runnerMarkerLeader: {
    backgroundColor: '#F59E0B',
    borderColor: '#FEF3C7',
  },
  runnerMarkerForfeited: {
    backgroundColor: '#DC2626',
    borderColor: '#FECACA',
  },
  runnerMarkerText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  runnerMarkerForfeitedText: {
    fontSize: 13,
    letterSpacing: -0.2,
  },
  runnerName: {
    marginTop: 8,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  runnerNameForfeited: {
    color: '#FECACA',
  },
  runnerBubbleForfeited: {
    backgroundColor: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? '#7F1D1D' : 'rgba(220,38,38,0.36)',
  },
  runnerMeta: {
    marginTop: 2,
    color: '#C7D2FE',
    fontSize: 11,
    fontWeight: '700',
  },
  runnerMetaForfeited: {
    color: '#FCA5A5',
  },
  runnerMetaMuted: {
    marginTop: 2,
    color: '#98A2B3',
    fontSize: 10,
    fontWeight: '700',
  },
  groupScroll: {
    flex: 1,
  },
  groupScrollContent: {
    paddingTop: 56,
    paddingBottom: 72,
  },
  groupRow: {
    height: GROUP_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 6,
  },
  groupRowCurrent: {
    backgroundColor: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? '#1D1D4F' : 'rgba(109,94,247,0.14)',
  },
  groupRowForfeited: {
    backgroundColor: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? '#321321' : 'rgba(220,38,38,0.12)',
  },
  groupRankColumn: {
    width: '16%',
    gap: 2,
  },
  groupRankText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  groupNameText: {
    color: '#C7D2FE',
    fontSize: 11,
    fontWeight: '700',
  },
  groupRoadLane: {
    width: '54%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupRunnerMarker: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI ? 1 : 2,
  },
  groupRunnerMarkerText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  groupRunnerMarkerForfeitedText: {
    fontSize: 9,
    letterSpacing: -0.4,
  },
  groupMetaColumn: {
    width: '20%',
    alignItems: 'flex-end',
    gap: 2,
  },
  groupMetaText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  groupMetaForfeitedText: {
    color: '#FECACA',
  },
  groupMetaSubtext: {
    color: '#98A2B3',
    fontSize: 10,
    fontWeight: '700',
  },
  footer: {
    color: '#98A2B3',
    fontSize: 12,
    lineHeight: 18,
  },
});
