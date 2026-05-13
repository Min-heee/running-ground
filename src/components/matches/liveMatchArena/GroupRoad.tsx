import { memo, useCallback, useMemo } from 'react';
import { FlatList, Platform, Text, View } from 'react-native';
import { buildLiveMatchRunnerVisualState } from '@/components/matches/liveMatchArenaVisualState';
import { RoadMotion } from '@/components/matches/liveMatchArena/RoadMotion';
import {
  GROUP_ROW_HEIGHT,
  ROAD_HEIGHT_GROUP,
  areParticipantArraysEqual,
  areParticipantsEqual,
  buildRemainingLabel,
  isForfeited,
} from '@/components/matches/liveMatchArena/helpers';
import { liveMatchArenaStyles as styles } from '@/components/matches/liveMatchArena/styles';
import type { ArenaParticipant } from '@/components/matches/liveMatchArena/types';

type GroupRoadRowProps = {
  participant: ArenaParticipant;
  index: number;
  targetDistanceKm: number;
};

const GroupRankColumn = memo(function GroupRankColumn({
  rankLabel,
  displayName,
}: {
  rankLabel: string;
  displayName: string;
}) {
  return (
    <View style={styles.groupRankColumn}>
      <Text style={styles.groupRankText}>{rankLabel}</Text>
      <Text style={styles.groupNameText}>{displayName}</Text>
    </View>
  );
});

const GroupRunnerMarker = memo(function GroupRunnerMarker({
  markerLabel,
  isCurrentUser,
  isLeader,
  forfeited,
}: {
  markerLabel: string;
  isCurrentUser: boolean;
  isLeader: boolean;
  forfeited: boolean;
}) {
  return (
    <View style={styles.groupRoadLane}>
      <View
        style={[
          styles.groupRunnerMarker,
          isCurrentUser
            ? styles.runnerMarkerCurrent
            : isLeader
              ? styles.runnerMarkerLeader
              : styles.runnerMarkerOpponent,
          forfeited ? styles.runnerMarkerForfeited : undefined,
        ]}
      >
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

const GroupRunnerMeta = memo(function GroupRunnerMeta({
  averagePaceLabel,
  distanceKm,
  targetDistanceKm,
  forfeited,
}: {
  averagePaceLabel: string;
  distanceKm: number;
  targetDistanceKm: number;
  forfeited: boolean;
}) {
  return (
    <View style={styles.groupMetaColumn}>
      <Text style={[styles.groupMetaText, forfeited ? styles.groupMetaForfeitedText : undefined]}>
        {averagePaceLabel}
      </Text>
      <Text style={styles.groupMetaSubtext}>{buildRemainingLabel(distanceKm, targetDistanceKm)}</Text>
    </View>
  );
});

const GroupRoadRow = memo(function GroupRoadRow({
  participant,
  index,
  targetDistanceKm,
}: GroupRoadRowProps) {
  const isCurrentUser = Boolean(participant.isCurrentUser);
  const participantForfeited = isForfeited(participant);
  const rankLabel = participant.rankLabel ?? `${index + 1}위`;
  const displayName = isCurrentUser ? '나' : participant.name;
  const visualState = buildLiveMatchRunnerVisualState(
    participant,
    isCurrentUser ? '나' : participant.name.slice(0, 1),
  );
  const rowStyle = useMemo(
    () => [
      styles.groupRow,
      isCurrentUser ? styles.groupRowCurrent : undefined,
      participantForfeited ? styles.groupRowForfeited : undefined,
    ],
    [isCurrentUser, participantForfeited],
  );

  return (
    <View style={rowStyle}>
      <GroupRankColumn rankLabel={rankLabel} displayName={displayName} />
      <GroupRunnerMarker
        markerLabel={visualState.markerLabel}
        isCurrentUser={isCurrentUser}
        isLeader={Boolean(participant.isLeader)}
        forfeited={participantForfeited}
      />
      <GroupRunnerMeta
        averagePaceLabel={visualState.averagePaceLabel}
        distanceKm={participant.distanceKm}
        targetDistanceKm={targetDistanceKm}
        forfeited={participantForfeited}
      />
    </View>
  );
}, (prevProps, nextProps) => (
  prevProps.index === nextProps.index
  && prevProps.targetDistanceKm === nextProps.targetDistanceKm
  && areParticipantsEqual(prevProps.participant, nextProps.participant)
));

export const GroupRoad = memo(function GroupRoad({
  participants,
  targetDistanceKm,
}: {
  participants: ArenaParticipant[];
  targetDistanceKm: number;
}) {
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
    <GroupRoadRow participant={item} index={index} targetDistanceKm={targetDistanceKm} />
  ), [targetDistanceKm]);
  const keyExtractor = useCallback((participant: ArenaParticipant) => participant.id, []);
  const getItemLayout = useCallback((_: ArrayLike<ArenaParticipant> | null | undefined, index: number) => ({
    length: GROUP_ROW_HEIGHT,
    offset: GROUP_ROW_HEIGHT * index,
    index,
  }), []);

  return (
    <View style={[styles.roadCard, { height: ROAD_HEIGHT_GROUP }]}>
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
  prevProps.targetDistanceKm === nextProps.targetDistanceKm
  && areParticipantArraysEqual(prevProps.participants, nextProps.participants)
));
