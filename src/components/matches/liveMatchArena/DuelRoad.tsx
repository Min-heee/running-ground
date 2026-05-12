import { memo, useMemo } from 'react';
import { Text, View } from 'react-native';
import { buildLiveMatchRunnerVisualState } from '@/components/matches/liveMatchArenaVisualState';
import { RoadMotion } from '@/components/matches/liveMatchArena/RoadMotion';
import type { ArenaParticipant } from '@/components/matches/liveMatchArena/types';
import {
  ROAD_HEIGHT_DUEL,
  areParticipantArraysEqual,
  areParticipantsEqual,
  buildRemainingLabel,
  clamp,
  isForfeited,
  shouldShowRunnerBubble,
} from '@/components/matches/liveMatchArena/helpers';
import { liveMatchArenaStyles as styles } from '@/components/matches/liveMatchArena/styles';

const DuelRunnerMarker = memo(function DuelRunnerMarker({
  participant,
  fallbackLabel,
  isCurrentUser,
}: {
  participant: ArenaParticipant;
  fallbackLabel: string;
  isCurrentUser: boolean;
}) {
  const visualState = buildLiveMatchRunnerVisualState(participant, fallbackLabel);
  const participantForfeited = visualState.isForfeited;

  return (
    <>
      <View style={[
        styles.runnerMarker,
        isCurrentUser ? styles.runnerMarkerCurrent : styles.runnerMarkerOpponent,
        participantForfeited ? styles.runnerMarkerForfeited : undefined,
      ]}>
        <Text style={[styles.runnerMarkerText, participantForfeited ? styles.runnerMarkerForfeitedText : undefined]}>
          {visualState.markerLabel}
        </Text>
      </View>
      {shouldShowRunnerBubble(participant) ? (
        <View style={[
          styles.runnerBubble,
          isCurrentUser ? styles.runnerBubbleCurrent : undefined,
          participantForfeited ? styles.runnerBubbleForfeited : undefined,
        ]}>
          <Text style={[styles.runnerBubbleText, participantForfeited ? styles.runnerBubbleForfeitedText : undefined]}>
            {visualState.bubbleLabel}
          </Text>
        </View>
      ) : null}
    </>
  );
}, (prevProps, nextProps) => (
  prevProps.fallbackLabel === nextProps.fallbackLabel
  && prevProps.isCurrentUser === nextProps.isCurrentUser
  && areParticipantsEqual(prevProps.participant, nextProps.participant)
));

const DuelRunner = memo(function DuelRunner({
  participant,
  top,
  targetDistanceKm,
  side,
}: {
  participant: ArenaParticipant;
  top: number;
  targetDistanceKm: number;
  side: 'left' | 'right';
}) {
  const participantForfeited = isForfeited(participant);
  const isCurrentUser = Boolean(participant.isCurrentUser);
  const displayName = isCurrentUser ? '나' : participant.name;
  const fallbackLabel = isCurrentUser ? '나' : participant.name.slice(0, 1);

  return (
    <View style={[
      styles.duelRunnerWrap,
      side === 'left' ? styles.duelRunnerLeft : styles.duelRunnerRight,
      { top },
    ]}>
      <DuelRunnerMarker
        participant={participant}
        fallbackLabel={fallbackLabel}
        isCurrentUser={isCurrentUser}
      />
      <Text style={[styles.runnerName, participantForfeited ? styles.runnerNameForfeited : undefined]}>{displayName}</Text>
      <Text style={[styles.runnerMeta, participantForfeited ? styles.runnerMetaForfeited : undefined]}>
        {participantForfeited ? '기권' : `${participant.distanceKm.toFixed(2)}km`}
      </Text>
      <Text style={styles.runnerMetaMuted}>
        {participantForfeited ? '대결 중단' : buildRemainingLabel(participant.distanceKm, targetDistanceKm)}
      </Text>
    </View>
  );
}, (prevProps, nextProps) => (
  prevProps.top === nextProps.top
  && prevProps.targetDistanceKm === nextProps.targetDistanceKm
  && prevProps.side === nextProps.side
  && areParticipantsEqual(prevProps.participant, nextProps.participant)
));

export const DuelRoad = memo(function DuelRoad({
  participants,
  targetDistanceKm,
}: {
  participants: ArenaParticipant[];
  targetDistanceKm: number;
}) {
  const currentUser = participants.find((participant) => participant.isCurrentUser) ?? participants[0] ?? null;
  const opponent = participants.find((participant) => !participant.isCurrentUser) ?? participants[1] ?? null;

  const { userTop, opponentTop } = useMemo(() => {
    if (!currentUser || !opponent) {
      return { userTop: 0, opponentTop: 0 };
    }

    const safeTargetDistanceKm = Math.max(0.1, targetDistanceKm);
    const finishTop = 62;
    const startTop = ROAD_HEIGHT_DUEL - 124;
    const pathHeight = startTop - finishTop;
    const currentProgress = clamp(currentUser.distanceKm / safeTargetDistanceKm, 0, 1);
    const opponentProgress = clamp(opponent.distanceKm / safeTargetDistanceKm, 0, 1);
    const gapKm = currentUser.distanceKm - opponent.distanceKm;
    let nextUserTop = startTop - currentProgress * pathHeight;
    let nextOpponentTop = startTop - opponentProgress * pathHeight;

    if (Math.abs(gapKm) >= 0.005 && Math.abs(nextUserTop - nextOpponentTop) < 22) {
      const visualLeadOffset = 14;
      if (gapKm > 0) {
        nextUserTop -= visualLeadOffset;
        nextOpponentTop += visualLeadOffset;
      } else {
        nextUserTop += visualLeadOffset;
        nextOpponentTop -= visualLeadOffset;
      }
    }

    return {
      userTop: clamp(nextUserTop, finishTop, startTop),
      opponentTop: clamp(nextOpponentTop, finishTop, startTop),
    };
  }, [currentUser, opponent, targetDistanceKm]);

  if (!currentUser || !opponent) {
    return null;
  }

  return (
    <View style={[styles.roadCard, { height: ROAD_HEIGHT_DUEL }]}>
      <RoadMotion laneMode="duel" />
      <DuelRunner participant={opponent} top={opponentTop} targetDistanceKm={targetDistanceKm} side="left" />
      <DuelRunner participant={currentUser} top={userTop} targetDistanceKm={targetDistanceKm} side="right" />
    </View>
  );
}, (prevProps, nextProps) => (
  prevProps.targetDistanceKm === nextProps.targetDistanceKm
  && areParticipantArraysEqual(prevProps.participants, nextProps.participants)
));
