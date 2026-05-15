import { memo } from 'react';
import { Text, View } from 'react-native';
import { DuelRoad } from '@/components/matches/liveMatchArena/DuelRoad';
import { GroupRoad } from '@/components/matches/liveMatchArena/GroupRoad';
import { areParticipantArraysEqual } from '@/components/matches/liveMatchArena/helpers';
import { liveMatchArenaStyles as styles } from '@/components/matches/liveMatchArena/styles';
import type { ArenaParticipant } from '@/components/matches/liveMatchArena/types';

const LiveMatchStartupRoad = memo(function LiveMatchStartupRoad() {
  return (
    <View style={styles.startupRoadShell}>
      <Text style={styles.startupRoadText}>대결 화면 준비 중...</Text>
    </View>
  );
});

export const ArenaRoadContent = memo(function ArenaRoadContent({
  mode,
  shouldDeferHeavyContent,
  duelParticipants,
  visibleGroupParticipants,
  targetDistanceKm,
}: {
  mode: 'duel' | 'group';
  shouldDeferHeavyContent: boolean;
  duelParticipants: ArenaParticipant[];
  visibleGroupParticipants: ArenaParticipant[];
  targetDistanceKm: number;
}) {
  if (shouldDeferHeavyContent) {
    return <LiveMatchStartupRoad />;
  }

  if (mode === 'duel') {
    return <DuelRoad participants={duelParticipants} targetDistanceKm={targetDistanceKm} />;
  }

  return <GroupRoad participants={visibleGroupParticipants} targetDistanceKm={targetDistanceKm} />;
}, (prevProps, nextProps) => (
  prevProps.mode === nextProps.mode
  && prevProps.shouldDeferHeavyContent === nextProps.shouldDeferHeavyContent
  && prevProps.targetDistanceKm === nextProps.targetDistanceKm
  && areParticipantArraysEqual(prevProps.duelParticipants, nextProps.duelParticipants)
  && areParticipantArraysEqual(prevProps.visibleGroupParticipants, nextProps.visibleGroupParticipants)
));
