import { memo } from 'react';
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

  return (
    <View
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
        <View
          style={[
            styles.groupRunnerMarker,
            isCurrentUser
              ? styles.runnerMarkerCurrent
              : participant.isLeader
                ? styles.runnerMarkerLeader
                : styles.runnerMarkerOpponent,
            participantForfeited ? styles.runnerMarkerForfeited : undefined,
          ]}
        >
          <Text
            style={[
              styles.groupRunnerMarkerText,
              participantForfeited ? styles.groupRunnerMarkerForfeitedText : undefined,
            ]}
          >
            {visualState.markerLabel}
          </Text>
        </View>
      </View>
      <View style={styles.groupMetaColumn}>
        <Text style={[styles.groupMetaText, participantForfeited ? styles.groupMetaForfeitedText : undefined]}>
          {visualState.averagePaceLabel}
        </Text>
        <Text style={styles.groupMetaSubtext}>{buildRemainingLabel(participant.distanceKm, targetDistanceKm)}</Text>
      </View>
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
  const currentUserIndex = Math.max(
    0,
    participants.findIndex((participant) => participant.isCurrentUser),
  );
  const initialScrollIndex = Math.min(currentUserIndex, Math.max(participants.length - 1, 0));

  return (
    <View style={[styles.roadCard, { height: ROAD_HEIGHT_GROUP }]}>
      <RoadMotion laneMode="group" />
      <FlatList
        style={styles.groupScroll}
        contentContainerStyle={[
          styles.groupScrollContent,
          { minHeight: Math.max(ROAD_HEIGHT_GROUP + GROUP_ROW_HEIGHT, participants.length * GROUP_ROW_HEIGHT + 32) },
        ]}
        data={participants}
        renderItem={({ item, index }) => (
          <GroupRoadRow participant={item} index={index} targetDistanceKm={targetDistanceKm} />
        )}
        keyExtractor={(participant) => participant.id}
        getItemLayout={(_, index) => ({
          length: GROUP_ROW_HEIGHT,
          offset: GROUP_ROW_HEIGHT * index,
          index,
        })}
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
