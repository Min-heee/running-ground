import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

type ArenaParticipant = {
  id: string;
  name: string;
  paceLabel: string;
  bpmLabel?: string | null;
  distanceKm: number;
  rankLabel?: string;
  isCurrentUser?: boolean;
  isLeader?: boolean;
  liveStatus?: 'ready' | 'running' | 'background' | 'paused' | 'disconnected' | 'forfeited' | 'finished';
  showPaceBubble?: boolean;
  emphasis?: 'featured' | 'compact';
};

const ROAD_HEIGHT_DUEL = 432;
const ROAD_HEIGHT_GROUP = 432;
const ROAD_STRIPE_HEIGHT = 34;
const ROAD_STRIPE_SPACING = 88;
const GROUP_ROW_HEIGHT = 78;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function buildBubbleLabel(participant: ArenaParticipant) {
  return participant.bpmLabel ? `${participant.paceLabel} · ${participant.bpmLabel}` : participant.paceLabel;
}

function shouldShowRunnerBubble(participant: ArenaParticipant) {
  return Boolean(participant.showPaceBubble && participant.paceLabel.trim());
}

function isForfeited(participant: ArenaParticipant) {
  return participant.liveStatus === 'forfeited';
}

function buildMarkerLabel(participant: ArenaParticipant, fallbackLabel: string) {
  return isForfeited(participant) ? '기권' : fallbackLabel;
}

function buildRunnerBubbleLabel(participant: ArenaParticipant) {
  return isForfeited(participant) ? '기권 처리됨' : buildBubbleLabel(participant);
}

function buildRemainingLabel(distanceKm: number, targetDistanceKm: number) {
  return `${Math.max(0, targetDistanceKm - distanceKm).toFixed(2)}km 남음`;
}

function RoadMotion({
  roadHeight,
  laneMode,
}: {
  roadHeight: number;
  laneMode: 'duel' | 'group';
}) {
  const shift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shift, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    loop.start();
    return () => {
      loop.stop();
      shift.stopAnimation();
      shift.setValue(0);
    };
  }, [shift]);

  const translateY = shift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, ROAD_STRIPE_SPACING],
  });

  return (
    <View style={styles.roadBackground}>
      {laneMode === 'duel' ? (
        <>
          <View style={styles.duelRoadBase} />
          <View style={styles.duelCenterDivider} />
          <View style={[styles.duelLaneBase, styles.duelLaneLeft]} />
          <View style={[styles.duelLaneBase, styles.duelLaneRight]} />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.duelCenterMarkingsWrap,
              {
                transform: [{ translateY }],
              },
            ]}
          >
            {Array.from({ length: 12 }).map((_, index) => (
              <View key={`duel-stripe-${index}`} style={styles.duelStripeRow}>
                <View style={styles.duelStripe} />
                <View style={styles.duelStripe} />
              </View>
            ))}
          </Animated.View>
        </>
      ) : (
        <>
          <View style={styles.groupRoadBase} />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.groupCenterMarkingsWrap,
              {
                transform: [{ translateY }],
              },
            ]}
          >
            {Array.from({ length: 14 }).map((_, index) => (
              <View key={`group-stripe-${index}`} style={styles.groupStripe} />
            ))}
          </Animated.View>
        </>
      )}
      <View style={[styles.finishRibbon, laneMode === 'group' ? styles.finishRibbonGroup : undefined]}>
        <Text style={styles.finishRibbonText}>FINISH</Text>
      </View>
    </View>
  );
}

function DuelRoad({
  participants,
  targetDistanceKm,
}: {
  participants: ArenaParticipant[];
  targetDistanceKm: number;
}) {
  const currentUser = participants.find((participant) => participant.isCurrentUser) ?? participants[0] ?? null;
  const opponent = participants.find((participant) => !participant.isCurrentUser) ?? participants[1] ?? null;

  if (!currentUser || !opponent) {
    return null;
  }

  const safeTargetDistanceKm = Math.max(0.1, targetDistanceKm);
  const finishTop = 62;
  const startTop = ROAD_HEIGHT_DUEL - 124;
  const pathHeight = startTop - finishTop;
  const currentProgress = clamp(currentUser.distanceKm / safeTargetDistanceKm, 0, 1);
  const opponentProgress = clamp(opponent.distanceKm / safeTargetDistanceKm, 0, 1);
  const gapKm = currentUser.distanceKm - opponent.distanceKm;
  let userTop = startTop - currentProgress * pathHeight;
  let opponentTop = startTop - opponentProgress * pathHeight;

  if (Math.abs(gapKm) >= 0.005 && Math.abs(userTop - opponentTop) < 22) {
    const visualLeadOffset = 14;
    if (gapKm > 0) {
      userTop -= visualLeadOffset;
      opponentTop += visualLeadOffset;
    } else {
      userTop += visualLeadOffset;
      opponentTop -= visualLeadOffset;
    }
  }

  userTop = clamp(userTop, finishTop, startTop);
  opponentTop = clamp(opponentTop, finishTop, startTop);

  return (
    <View style={[styles.roadCard, { height: ROAD_HEIGHT_DUEL }]}>
      <RoadMotion laneMode="duel" roadHeight={ROAD_HEIGHT_DUEL} />
      <View style={[styles.duelRunnerWrap, styles.duelRunnerLeft, { top: opponentTop }]}>
        <View style={[styles.runnerMarker, styles.runnerMarkerOpponent, isForfeited(opponent) ? styles.runnerMarkerForfeited : undefined]}>
          <Text style={[styles.runnerMarkerText, isForfeited(opponent) ? styles.runnerMarkerForfeitedText : undefined]}>
            {buildMarkerLabel(opponent, opponent.name.slice(0, 1))}
          </Text>
        </View>
        {shouldShowRunnerBubble(opponent) ? (
          <View style={[styles.runnerBubble, isForfeited(opponent) ? styles.runnerBubbleForfeited : undefined]}>
            <Text style={[styles.runnerBubbleText, isForfeited(opponent) ? styles.runnerBubbleForfeitedText : undefined]}>
              {buildRunnerBubbleLabel(opponent)}
            </Text>
          </View>
        ) : null}
        <Text style={[styles.runnerName, isForfeited(opponent) ? styles.runnerNameForfeited : undefined]}>{opponent.name}</Text>
        <Text style={[styles.runnerMeta, isForfeited(opponent) ? styles.runnerMetaForfeited : undefined]}>
          {isForfeited(opponent) ? '기권' : `${opponent.distanceKm.toFixed(2)}km`}
        </Text>
        <Text style={styles.runnerMetaMuted}>
          {isForfeited(opponent) ? '대결 중단' : buildRemainingLabel(opponent.distanceKm, targetDistanceKm)}
        </Text>
      </View>
      <View style={[styles.duelRunnerWrap, styles.duelRunnerRight, { top: userTop }]}>
        <View style={[styles.runnerMarker, styles.runnerMarkerCurrent, isForfeited(currentUser) ? styles.runnerMarkerForfeited : undefined]}>
          <Text style={[styles.runnerMarkerText, isForfeited(currentUser) ? styles.runnerMarkerForfeitedText : undefined]}>
            {buildMarkerLabel(currentUser, '나')}
          </Text>
        </View>
        {shouldShowRunnerBubble(currentUser) ? (
          <View style={[styles.runnerBubble, styles.runnerBubbleCurrent, isForfeited(currentUser) ? styles.runnerBubbleForfeited : undefined]}>
            <Text style={[styles.runnerBubbleText, isForfeited(currentUser) ? styles.runnerBubbleForfeitedText : undefined]}>
              {buildRunnerBubbleLabel(currentUser)}
            </Text>
          </View>
        ) : null}
        <Text style={[styles.runnerName, isForfeited(currentUser) ? styles.runnerNameForfeited : undefined]}>나</Text>
        <Text style={[styles.runnerMeta, isForfeited(currentUser) ? styles.runnerMetaForfeited : undefined]}>
          {isForfeited(currentUser) ? '기권' : `${currentUser.distanceKm.toFixed(2)}km`}
        </Text>
        <Text style={styles.runnerMetaMuted}>
          {isForfeited(currentUser) ? '대결 중단' : buildRemainingLabel(currentUser.distanceKm, targetDistanceKm)}
        </Text>
      </View>
    </View>
  );
}

function GroupRoad({
  participants,
  targetDistanceKm,
}: {
  participants: ArenaParticipant[];
  targetDistanceKm: number;
}) {
  const orderedParticipants = useMemo(
    () => [...participants].sort((left, right) => {
      if (isForfeited(left) !== isForfeited(right)) {
        return isForfeited(left) ? 1 : -1;
      }

      return right.distanceKm - left.distanceKm;
    }),
    [participants],
  );
  const currentUserIndex = Math.max(
    0,
    orderedParticipants.findIndex((participant) => participant.isCurrentUser),
  );
  const initialOffset = Math.max(0, currentUserIndex * GROUP_ROW_HEIGHT - ROAD_HEIGHT_GROUP / 2 + GROUP_ROW_HEIGHT / 2);

  return (
    <View style={[styles.roadCard, { height: ROAD_HEIGHT_GROUP }]}>
      <RoadMotion laneMode="group" roadHeight={ROAD_HEIGHT_GROUP} />
      <ScrollView
        style={styles.groupScroll}
        contentContainerStyle={[
          styles.groupScrollContent,
          { minHeight: Math.max(ROAD_HEIGHT_GROUP + GROUP_ROW_HEIGHT, orderedParticipants.length * GROUP_ROW_HEIGHT + 32) },
        ]}
        showsVerticalScrollIndicator={false}
        contentOffset={{ x: 0, y: initialOffset }}
      >
        {orderedParticipants.map((participant, index) => {
          const isCurrentUser = Boolean(participant.isCurrentUser);
          const participantForfeited = isForfeited(participant);
          const rankLabel = participant.rankLabel ?? `${index + 1}위`;
          const displayName = isCurrentUser ? '나' : participant.name;

          return (
            <View
              key={participant.id}
              style={[
                styles.groupRow,
                isCurrentUser ? styles.groupRowCurrent : undefined,
                participantForfeited ? styles.groupRowForfeited : undefined,
              ]}
            >
              <View style={styles.groupRankColumn}>
                <Text style={styles.groupRankText}>{rankLabel}</Text>
                <Text style={styles.groupNameText}>{displayName}</Text>
              </View>
              <View style={styles.groupRoadLane}>
                <View style={[
                  styles.groupRunnerMarker,
                  isCurrentUser ? styles.runnerMarkerCurrent : participant.isLeader ? styles.runnerMarkerLeader : styles.runnerMarkerOpponent,
                  participantForfeited ? styles.runnerMarkerForfeited : undefined,
                ]}>
                  <Text style={[styles.groupRunnerMarkerText, participantForfeited ? styles.groupRunnerMarkerForfeitedText : undefined]}>
                    {buildMarkerLabel(participant, isCurrentUser ? '나' : participant.name.slice(0, 1))}
                  </Text>
                </View>
              </View>
              <View style={styles.groupMetaColumn}>
                <Text style={[styles.groupMetaText, participantForfeited ? styles.groupMetaForfeitedText : undefined]}>
                  {participantForfeited ? '기권' : participant.paceLabel || '측정 대기'}
                </Text>
                <Text style={styles.groupMetaSubtext}>{buildRemainingLabel(participant.distanceKm, targetDistanceKm)}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function LiveMatchArena({
  mode,
  targetDistanceKm,
  title,
  subtitle,
  summaryChips,
  participants,
  footer,
}: {
  mode: 'duel' | 'group';
  targetDistanceKm: number;
  title: string;
  subtitle: string;
  summaryChips: string[];
  participants: ArenaParticipant[];
  footer?: string;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.max(300, windowWidth - 32);

  return (
    <View style={[styles.card, { width: cardWidth }]}>
      <Text style={styles.eyebrow}>{mode === 'duel' ? 'DUEL ROAD' : 'GROUP ROAD'}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <View style={styles.summaryChipRow}>
        {summaryChips.map((chip) => (
          <View key={chip} style={styles.summaryChip}>
            <Text style={styles.summaryChipText}>{chip}</Text>
          </View>
        ))}
      </View>
      {mode === 'duel' ? (
        <DuelRoad participants={participants} targetDistanceKm={targetDistanceKm} />
      ) : (
        <GroupRoad participants={participants} targetDistanceKm={targetDistanceKm} />
      )}
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    borderRadius: 28,
    borderWidth: 1,
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
    backgroundColor: 'rgba(255,255,255,0.12)',
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
    borderWidth: 1,
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
    backgroundColor: 'rgba(44, 67, 160, 0.38)',
  },
  duelLaneBase: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '47%',
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.02)',
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
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  groupRoadBase: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: 28,
    backgroundColor: '#101A31',
    borderWidth: 1,
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
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  finishRibbon: {
    position: 'absolute',
    top: 14,
    left: 10,
    right: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(109,94,247,0.24)',
    borderWidth: 1,
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
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  runnerBubbleCurrent: {
    backgroundColor: 'rgba(129, 140, 248, 0.32)',
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
    borderWidth: 2,
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
    backgroundColor: 'rgba(220,38,38,0.36)',
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
    backgroundColor: 'rgba(109,94,247,0.14)',
  },
  groupRowForfeited: {
    backgroundColor: 'rgba(220,38,38,0.12)',
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
    borderWidth: 2,
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
