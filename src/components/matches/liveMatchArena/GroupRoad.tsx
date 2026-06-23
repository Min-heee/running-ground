import { memo, useCallback, useMemo } from 'react';
import { FlatList, Platform, Text, View } from 'react-native';
import { buildLiveMatchRunnerVisualState } from '@/components/matches/liveMatchArenaVisualState';
import { RoadMotion } from '@/components/matches/liveMatchArena/RoadMotion';
import {
  GROUP_LIST_TOP_INSET,
  GROUP_ROW_HEIGHT,
  ROAD_HEIGHT_GROUP,
  areParticipantArraysEqual,
  areParticipantsEqual,
  isForfeited,
} from '@/components/matches/liveMatchArena/helpers';
import { liveMatchArenaStyles as styles } from '@/components/matches/liveMatchArena/styles';
import type { ArenaParticipant } from '@/components/matches/liveMatchArena/types';
import { colors } from '@/theme/tokens';

type GroupRoadRowProps = {
  participant: ArenaParticipant;
  index: number;
};

const RUNNER_DOT_PALETTE = [
  colors.runnerDotTeal,
  colors.runnerDotSky,
  colors.runnerDotOrange,
  colors.runnerDotPink,
  colors.runnerDotLime,
  colors.runnerDotAmber,
];

// Stable, RANK-INDEPENDENT dot color for a group runner. Keyed on the participant id
// (which never changes during a race) so a runner keeps ONE color start to finish — the
// dot never recolors as ranks swap. (The old logic flipped the leader's dot to gold every
// time the lead changed, which re-rendered the marker and could stutter on Android.) 'me'
// stays brand purple and a forfeited runner stays danger red — neither depends on rank.
function getGroupRunnerDotColors(id: string, isCurrentUser: boolean, forfeited: boolean) {
  if (forfeited) {
    return { backgroundColor: colors.dangerVivid, borderColor: colors.dangerBorder };
  }
  if (isCurrentUser) {
    return { backgroundColor: colors.brand, borderColor: colors.brandWashStrong };
  }
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return {
    backgroundColor: RUNNER_DOT_PALETTE[Math.abs(hash) % RUNNER_DOT_PALETTE.length],
    borderColor: colors.runnerDotBorder,
  };
}

const GroupRankColumn = memo(function GroupRankColumn({
  rankLabel,
  displayName,
  highlight,
}: {
  rankLabel: string;
  displayName: string;
  highlight: boolean;
}) {
  const rankColumnStyle = useMemo(
    () => [styles.groupRankColumn, highlight ? styles.groupRankColumnCurrentFinished : undefined],
    [highlight],
  );
  const rankTextStyle = useMemo(
    () => [styles.groupRankText, highlight ? styles.groupRankTextCurrentFinished : undefined],
    [highlight],
  );

  return (
    <View style={rankColumnStyle}>
      <Text style={rankTextStyle}>
        {rankLabel}
      </Text>
      <Text style={styles.groupNameText}>{displayName}</Text>
    </View>
  );
});

const GroupRunnerMarker = memo(function GroupRunnerMarker({
  markerLabel,
  backgroundColor,
  borderColor,
  forfeited,
}: {
  markerLabel: string;
  backgroundColor: string;
  borderColor: string;
  forfeited: boolean;
}) {
  const markerStyle = useMemo(
    () => [styles.groupRunnerMarker, { backgroundColor, borderColor }],
    [backgroundColor, borderColor],
  );

  return (
    <View style={styles.groupRoadLane}>
      <View style={markerStyle}>
        <Text
          style={[
            styles.groupRunnerMarkerText,
            forfeited ? styles.groupRunnerMarkerForfeitedText : undefined,
          ]}
        >
          {markerLabel}
        </Text>
      </View>
    </View>
  );
});

// Group rows keep the average pace (평균페이스) but drop the remaining-distance
// (남은거리) subtext — the analogous removal to the duel road. Participant names
// stay (see GroupRankColumn) so a 3+ person board can tell runners apart.
const GroupRunnerMeta = memo(function GroupRunnerMeta({
  averagePaceLabel,
  forfeited,
}: {
  averagePaceLabel: string;
  forfeited: boolean;
}) {
  return (
    <View style={styles.groupMetaColumn}>
      <Text style={[styles.groupMetaText, forfeited ? styles.groupMetaForfeitedText : undefined]}>
        {averagePaceLabel}
      </Text>
    </View>
  );
});

const GroupRoadRow = memo(function GroupRoadRow({
  participant,
  index,
}: GroupRoadRowProps) {
  const isCurrentUser = Boolean(participant.isCurrentUser);
  const participantForfeited = isForfeited(participant);
  const currentUserFinished = isCurrentUser && participant.liveStatus === 'finished';
  const rankLabel = participant.rankLabel ?? `${index + 1}위`;
  const displayName = isCurrentUser ? '나' : participant.name;
  const fallbackMarkerLabel = isCurrentUser ? '나' : participant.name.slice(0, 1);
  const visualState = useMemo(
    () => buildLiveMatchRunnerVisualState({
      name: participant.name,
      paceLabel: participant.paceLabel,
      bpmLabel: participant.bpmLabel,
      isCurrentUser: participant.isCurrentUser,
      isLeader: participant.isLeader,
      liveStatus: participant.liveStatus,
    }, fallbackMarkerLabel),
    [
      fallbackMarkerLabel,
      participant.bpmLabel,
      participant.isCurrentUser,
      participant.isLeader,
      participant.liveStatus,
      participant.name,
      participant.paceLabel,
    ],
  );
  const rowStyle = useMemo(
    () => [
      styles.groupRow,
      isCurrentUser ? styles.groupRowCurrent : undefined,
      participantForfeited ? styles.groupRowForfeited : undefined,
    ],
    [isCurrentUser, participantForfeited],
  );
  const dotColors = useMemo(
    () => getGroupRunnerDotColors(participant.id, isCurrentUser, participantForfeited),
    [participant.id, isCurrentUser, participantForfeited],
  );

  return (
    <View style={rowStyle}>
      <GroupRankColumn
        rankLabel={rankLabel}
        displayName={displayName}
        highlight={currentUserFinished}
      />
      <GroupRunnerMarker
        markerLabel={visualState.markerLabel}
        backgroundColor={dotColors.backgroundColor}
        borderColor={dotColors.borderColor}
        forfeited={participantForfeited}
      />
      <GroupRunnerMeta
        averagePaceLabel={visualState.averagePaceLabel}
        forfeited={participantForfeited}
      />
    </View>
  );
}, (prevProps, nextProps) => (
  prevProps.index === nextProps.index
  && areParticipantsEqual(prevProps.participant, nextProps.participant)
));

export const GroupRoad = memo(function GroupRoad({
  participants,
}: {
  participants: ArenaParticipant[];
}) {
  const roadCardStyle = useMemo(
    () => [styles.roadCard, { height: ROAD_HEIGHT_GROUP }],
    [],
  );
  const currentUserIndex = useMemo(
    () => Math.max(
      0,
      participants.findIndex((participant) => participant.isCurrentUser),
    ),
    [participants],
  );
  const initialScrollIndex = useMemo(
    () => Math.min(currentUserIndex, Math.max(participants.length - 1, 0)),
    [currentUserIndex, participants.length],
  );
  const contentContainerStyle = useMemo(
    () => [
      styles.groupScrollContent,
      { minHeight: Math.max(ROAD_HEIGHT_GROUP + GROUP_ROW_HEIGHT, participants.length * GROUP_ROW_HEIGHT + 32) },
    ],
    [participants.length],
  );
  const renderItem = useCallback(({ item, index }: { item: ArenaParticipant; index: number }) => (
    <GroupRoadRow participant={item} index={index} />
  ), []);
  const keyExtractor = useCallback((participant: ArenaParticipant) => participant.id, []);
  const getItemLayout = useCallback((_: ArrayLike<ArenaParticipant> | null | undefined, index: number) => ({
    length: GROUP_ROW_HEIGHT,
    // Include the content top inset so initialScrollIndex/scrollToIndex on Android
    // (which scroll to the raw getItemLayout offset and ignore contentContainerStyle
    // paddingTop) keep row 0 below the FINISH banner instead of riding up under it.
    offset: GROUP_LIST_TOP_INSET + GROUP_ROW_HEIGHT * index,
    index,
  }), []);

  return (
    <View style={roadCardStyle}>
      <RoadMotion laneMode="group" />
      <FlatList
        style={styles.groupScroll}
        contentContainerStyle={contentContainerStyle}
        data={participants}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        initialScrollIndex={participants.length ? initialScrollIndex : undefined}
        initialNumToRender={Platform.OS === 'android' ? 7 : 12}
        maxToRenderPerBatch={Platform.OS === 'android' ? 5 : 10}
        updateCellsBatchingPeriod={Platform.OS === 'android' ? 80 : 50}
        windowSize={Platform.OS === 'android' ? 5 : 9}
        removeClippedSubviews={Platform.OS === 'android'}
        showsVerticalScrollIndicator={false}
        onScrollToIndexFailed={() => {}}
      />
    </View>
  );
}, (prevProps, nextProps) => (
  areParticipantArraysEqual(prevProps.participants, nextProps.participants)
));
