import { memo, useMemo } from 'react';
import { Text, View } from 'react-native';
import { buildLiveMatchRunnerVisualState } from '@/components/matches/liveMatchArenaVisualState';
import { RoadMotion } from '@/components/matches/liveMatchArena/RoadMotion';
import { ResultBadge } from '@/components/matches/liveMatchArena/ResultBadge';
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

function areDuelTokenVisualPropsEqual(
  left: ArenaParticipant,
  right: ArenaParticipant,
) {
  return left.name === right.name
    && left.paceLabel === right.paceLabel
    && left.bpmLabel === right.bpmLabel
    && left.isCurrentUser === right.isCurrentUser
    && left.liveStatus === right.liveStatus
    && left.resultLabel === right.resultLabel
    && left.showPaceBubble === right.showPaceBubble;
}

const DuelRunnerToken = memo(function DuelRunnerToken({
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
      <View style={styles.duelRunnerTokenWrap}>
        <View style={[
          styles.runnerMarker,
          isCurrentUser ? styles.runnerMarkerCurrent : styles.runnerMarkerOpponent,
          participantForfeited ? styles.runnerMarkerForfeited : undefined,
        ]}>
          <Text style={[styles.runnerMarkerText, participantForfeited ? styles.runnerMarkerForfeitedText : undefined]}>
            {visualState.markerLabel}
          </Text>
        </View>
        {participant.resultLabel ? (
          <View style={styles.duelRunnerResultBadge}>
            <ResultBadge label={participant.resultLabel} />
          </View>
        ) : null}
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
  && areDuelTokenVisualPropsEqual(prevProps.participant, nextProps.participant)
));

const DuelRunnerName = memo(function DuelRunnerName({
  displayName,
  forfeited,
}: {
  displayName: string;
  forfeited: boolean;
}) {
  return (
    <Text style={[styles.runnerName, forfeited ? styles.runnerNameForfeited : undefined]}>
      {displayName}
    </Text>
  );
});

const DuelRunnerDistanceMeta = memo(function DuelRunnerDistanceMeta({
  distanceKm,
  targetDistanceKm,
  forfeited,
}: {
  distanceKm: number;
  targetDistanceKm: number;
  forfeited: boolean;
}) {
  return (
    <>
      <Text style={[styles.runnerMeta, forfeited ? styles.runnerMetaForfeited : undefined]}>
        {forfeited ? '기권' : `${distanceKm.toFixed(2)}km`}
      </Text>
      <Text style={styles.runnerMetaMuted}>
        {forfeited ? '대결 중단' : buildRemainingLabel(distanceKm, targetDistanceKm)}
      </Text>
    </>
  );
});

const DuelRunnerTextStack = memo(function DuelRunnerTextStack({
  displayName,
  distanceKm,
  targetDistanceKm,
  forfeited,
}: {
  displayName: string;
  distanceKm: number;
  targetDistanceKm: number;
  forfeited: boolean;
}) {
  return (
    <>
      <DuelRunnerName displayName={displayName} forfeited={forfeited} />
      <DuelRunnerDistanceMeta
        distanceKm={distanceKm}
        targetDistanceKm={targetDistanceKm}
        forfeited={forfeited}
      />
    </>
  );
});

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
  const runnerStyle = useMemo(
    () => [
      styles.duelRunnerWrap,
      side === 'left' ? styles.duelRunnerLeft : styles.duelRunnerRight,
      { top },
    ],
    [side, top],
  );

  return (
    <View style={runnerStyle}>
      <DuelRunnerToken
        participant={participant}
        fallbackLabel={fallbackLabel}
        isCurrentUser={isCurrentUser}
      />
      <DuelRunnerTextStack
        displayName={displayName}
        distanceKm={participant.distanceKm}
        targetDistanceKm={targetDistanceKm}
        forfeited={participantForfeited}
      />
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
  const roadCardStyle = useMemo(
    () => [styles.roadCard, { height: ROAD_HEIGHT_DUEL }],
    [],
  );
  const { currentUser, opponent } = useMemo(() => ({
    currentUser: participants.find((participant) => participant.isCurrentUser) ?? participants[0] ?? null,
    opponent: participants.find((participant) => !participant.isCurrentUser) ?? participants[1] ?? null,
  }), [participants]);

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
    <View style={roadCardStyle}>
      <RoadMotion laneMode="duel" />
      <DuelRunner participant={opponent} top={opponentTop} targetDistanceKm={targetDistanceKm} side="left" />
      <DuelRunner participant={currentUser} top={userTop} targetDistanceKm={targetDistanceKm} side="right" />
    </View>
  );
}, (prevProps, nextProps) => (
  prevProps.targetDistanceKm === nextProps.targetDistanceKm
  && areParticipantArraysEqual(prevProps.participants, nextProps.participants)
));
