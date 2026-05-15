import { memo } from 'react';
import { ArenaRoadContent } from '@/components/matches/liveMatchArena/ArenaRoadContent';
import { areParticipantArraysEqual } from '@/components/matches/liveMatchArena/helpers';
import type { ArenaParticipant } from '@/components/matches/liveMatchArena/types';

type LiveMatchArenaRoadSectionProps = {
  mode: 'duel' | 'group';
  shouldDeferHeavyContent: boolean;
  duelParticipants: ArenaParticipant[];
  visibleGroupParticipants: ArenaParticipant[];
  targetDistanceKm: number;
};

export const LiveMatchArenaRoadSection = memo(function LiveMatchArenaRoadSection({
  mode,
  shouldDeferHeavyContent,
  duelParticipants,
  visibleGroupParticipants,
  targetDistanceKm,
}: LiveMatchArenaRoadSectionProps) {
  return (
    <ArenaRoadContent
      mode={mode}
      shouldDeferHeavyContent={shouldDeferHeavyContent}
      duelParticipants={duelParticipants}
      visibleGroupParticipants={visibleGroupParticipants}
      targetDistanceKm={targetDistanceKm}
    />
  );
}, (prevProps, nextProps) => (
  prevProps.mode === nextProps.mode
  && prevProps.shouldDeferHeavyContent === nextProps.shouldDeferHeavyContent
  && prevProps.targetDistanceKm === nextProps.targetDistanceKm
  && areParticipantArraysEqual(prevProps.duelParticipants, nextProps.duelParticipants)
  && areParticipantArraysEqual(prevProps.visibleGroupParticipants, nextProps.visibleGroupParticipants)
));
