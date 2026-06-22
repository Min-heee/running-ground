import { memo } from 'react';
import { BrandLoadingView } from '@/components/BrandLoadingView';
import { DuelRoad } from '@/components/matches/liveMatchArena/DuelRoad';
import { GroupRoad } from '@/components/matches/liveMatchArena/GroupRoad';
import { areParticipantArraysEqual } from '@/components/matches/liveMatchArena/helpers';
import { liveMatchArenaStyles as styles } from '@/components/matches/liveMatchArena/styles';
import type { ArenaParticipant } from '@/components/matches/liveMatchArena/types';

const LiveMatchStartupRoad = memo(function LiveMatchStartupRoad() {
  return <BrandLoadingView style={styles.startupRoadShell} edges={[]} />;
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

  return <GroupRoad participants={visibleGroupParticipants} />;
}, (prevProps, nextProps) => (
  prevProps.mode === nextProps.mode
  && prevProps.shouldDeferHeavyContent === nextProps.shouldDeferHeavyContent
  && prevProps.targetDistanceKm === nextProps.targetDistanceKm
  && areParticipantArraysEqual(prevProps.duelParticipants, nextProps.duelParticipants)
  && areParticipantArraysEqual(prevProps.visibleGroupParticipants, nextProps.visibleGroupParticipants)
));
