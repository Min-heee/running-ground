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

function buildRemainingLabel(distanceKm: number, targetDistanceKm: number) {
  return `${Math.max(0, targetDistanceKm - distanceKm).toFixed(1)}km 남음`;
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
          <View style={[styles.duelLaneBase, styles.duelLaneLeft]} />
          <View style={[styles.duelLaneBase, styles.duelLaneRight]} />
          <View style={[styles.duelShoulder, styles.duelShoulderLeft]} />
          <View style={[styles.duelShoulder, styles.duelShoulderRight]} />
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

  const gapKm = currentUser.distanceKm - opponent.distanceKm;
  const gapOffset = clamp((gapKm / Math.max(0.2, targetDistanceKm * 0.08)) * 96, -84, 84);
  const centerY = ROAD_HEIGHT_DUEL * 0.74;
  const userTop = centerY - gapOffset / 2;
  const opponentTop = centerY + gapOffset / 2;

  return (
    <View style={[styles.roadCard, { height: ROAD_HEIGHT_DUEL }]}>
      <RoadMotion laneMode="duel" roadHeight={ROAD_HEIGHT_DUEL} />
      <View style={[styles.duelRunnerWrap, styles.duelRunnerLeft, { top: opponentTop }]}>
        {opponent.showPaceBubble ? (
          <View style={styles.runnerBubble}>
            <Text style={styles.runnerBubbleText}>{buildBubbleLabel(opponent)}</Text>
          </View>
        ) : null}
        <View style={[styles.runnerMarker, styles.runnerMarkerOpponent]}>
          <Text style={styles.runnerMarkerText}>{opponent.name.slice(0, 1)}</Text>
        </View>
        <Text style={styles.runnerName}>{opponent.name}</Text>
        <Text style={styles.runnerMeta}>{opponent.distanceKm.toFixed(2)}km</Text>
        <Text style={styles.runnerMetaMuted}>{buildRemainingLabel(opponent.distanceKm, targetDistanceKm)}</Text>
      </View>
      <View style={[styles.duelRunnerWrap, styles.duelRunnerRight, { top: userTop }]}>
        {currentUser.showPaceBubble ? (
          <View style={[styles.runnerBubble, styles.runnerBubbleCurrent]}>
            <Text style={styles.runnerBubbleText}>{buildBubbleLabel(currentUser)}</Text>
          </View>
        ) : null}
        <View style={[styles.runnerMarker, styles.runnerMarkerCurrent]}>
          <Text style={styles.runnerMarkerText}>나</Text>
        </View>
        <Text style={styles.runnerName}>나</Text>
        <Text style={styles.runnerMeta}>{currentUser.distanceKm.toFixed(2)}km</Text>
        <Text style={styles.runnerMetaMuted}>{buildRemainingLabel(currentUser.distanceKm, targetDistanceKm)}</Text>
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
    () => [...participants].sort((left, right) => left.distanceKm - right.distanceKm),
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
          const rankLabel = participant.rankLabel ?? `${orderedParticipants.length - index}위`;
          const displayName = isCurrentUser ? '나' : participant.name;

          return (
            <View
              key={participant.id}
              style={[styles.groupRow, isCurrentUser ? styles.groupRowCurrent : undefined]}
            >
              <View style={styles.groupRankColumn}>
                <Text style={styles.groupRankText}>{rankLabel}</Text>
                <Text style={styles.groupNameText}>{displayName}</Text>
              </View>
              <View style={styles.groupRoadLane}>
                <View style={[styles.groupRunnerMarker, isCurrentUser ? styles.runnerMarkerCurrent : participant.isLeader ? styles.runnerMarkerLeader : styles.runnerMarkerOpponent]}>
                  <Text style={styles.groupRunnerMarkerText}>
                    {isCurrentUser ? '나' : participant.name.slice(0, 1)}
                  </Text>
                </View>
              </View>
              <View style={styles.groupMetaColumn}>
                <Text style={styles.groupMetaText}>{participant.paceLabel}</Text>
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
    left: '2%',
    width: '96%',
    borderRadius: 28,
    backgroundColor: '#101A31',
    borderWidth: 1,
    borderColor: 'rgba(199,210,254,0.14)',
  },
  duelLaneBase: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '40%',
    borderRadius: 32,
    backgroundColor: 'rgba(9,17,34,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(199,210,254,0.12)',
  },
  duelLaneLeft: {
    left: '10%',
  },
  duelLaneRight: {
    right: '10%',
  },
  duelShoulder: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  duelShoulderLeft: {
    left: '47.5%',
  },
  duelShoulderRight: {
    right: '47.5%',
  },
  duelCenterMarkingsWrap: {
    position: 'absolute',
    top: -ROAD_STRIPE_SPACING,
    left: '30%',
    right: '30%',
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
    left: '19%',
    width: '62%',
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
    top: 18,
    left: 14,
    right: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(109,94,247,0.24)',
    borderWidth: 1,
    borderColor: 'rgba(224,231,255,0.18)',
    paddingVertical: 6,
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
    left: '30%',
  },
  duelRunnerRight: {
    left: '70%',
  },
  runnerBubble: {
    marginBottom: 8,
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
  runnerMarkerText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  runnerName: {
    marginTop: 8,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  runnerMeta: {
    marginTop: 2,
    color: '#C7D2FE',
    fontSize: 11,
    fontWeight: '700',
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
    paddingHorizontal: 14,
    gap: 10,
  },
  groupRowCurrent: {
    backgroundColor: 'rgba(109,94,247,0.14)',
  },
  groupRankColumn: {
    width: '22%',
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
    width: '42%',
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
  groupMetaColumn: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 2,
  },
  groupMetaText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
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
