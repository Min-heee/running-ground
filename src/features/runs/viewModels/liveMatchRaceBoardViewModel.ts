import type { LiveMatchRaceBoardRow } from '@/components/matches/LiveMatchRaceBoard';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { DuelResultLabel } from '@/features/runs/types/matchResult';
import type { GroupLiveStanding } from '@/features/runs/viewModels/matchProgress';
import type { ArenaParticipantViewModel } from '@/features/runs/viewModels/matchViewModels';
import type { DuelMatchOpponent, RunningMatchRoom } from '@/lib/api/types';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import { buildDuelRaceBoardSection } from './duelRaceBoardRows';
import { buildGroupRaceBoardSection } from './groupRaceBoardRows';

export type LiveMatchRaceBoardViewModel = {
  title: string;
  subtitle: string;
  rows: LiveMatchRaceBoardRow[];
};

export type LiveMatchRaceBoardViewModelInput = {
  matchMode: RunMatchMode;
  effectiveDuelOpponent: DuelMatchOpponent | null;
  duelLiveGapKm: number | null;
  duelDistanceKm: number;
  groupDistanceKm: number;
  distanceKm: number;
  syncedDuelDistanceKm: number;
  syncedDuelOpponentDistanceKm: number;
  currentUserDuelLiveStatus: DuelMatchOpponent['liveStatus'] | null;
  currentUserDuelResultLabel?: DuelResultLabel | null;
  currentUserGroupLiveStatus: DuelMatchOpponent['liveStatus'] | null;
  opponentDuelResultLabel?: DuelResultLabel | null;
  roomLinkedDuelPlaceholderParticipants: ArenaParticipantViewModel[];
  roomLinkedGroupPlaceholderParticipants: ArenaParticipantViewModel[];
  visibleMatchRoom: RunningMatchRoom | null;
  groupLiveStandings: GroupLiveStanding[];
  currentUserArenaPace: string;
  groupArenaUsesLivePace: boolean;
};

export function buildLiveMatchRaceBoardViewModel(
  input: LiveMatchRaceBoardViewModelInput,
): LiveMatchRaceBoardViewModel | null {
  rgPerfMark('live match race board participant count', {
    hasDuelOpponent: Boolean(input.effectiveDuelOpponent),
    matchMode: input.matchMode,
    roomParticipantCount: input.visibleMatchRoom?.participants.length ?? 0,
    roomPlaceholderCount: input.roomLinkedDuelPlaceholderParticipants.length,
  });

  if (input.matchMode === 'duel') {
    return buildDuelRaceBoardSection(input);
  }

  if (input.matchMode === 'group') {
    return buildGroupRaceBoardSection(input);
  }

  return null;
}
