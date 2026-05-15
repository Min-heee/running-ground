import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { MatchExitSource } from '@/features/runs/lifecycle/matchExitFlow';
import type { GroupLiveStanding } from '@/features/runs/viewModels/matchProgress';
import type { DuelMatchOpponent } from '@/lib/api/types';

export type MatchStatusAlert = {
  tone: 'danger' | 'warning' | 'neutral';
  title: string;
  summary: string;
};

export type LiveMatchMetricLabels = {
  elapsedLabel: string;
  distanceLabel: string;
  averagePaceLabel: string;
  currentPaceLabel: string;
  cadenceLabel: string;
  elevationLabel: string;
};

export type LiveMatchProgressSectionProps = {
  includeMatchCards: boolean;
  matchMode: RunMatchMode;
  liveMatchTitle: string;
  liveMatchText: string;
  effectiveDuelOpponent: DuelMatchOpponent | null;
  duelDistanceKm: number;
  duelLiveTitle: string;
  duelLiveSummary: string;
  duelStatusAlert: MatchStatusAlert | null;
  distanceKm: number;
  isLeavingDuelMatch: boolean;
  effectiveGroupParticipantCount: number;
  currentGroupStanding: GroupLiveStanding | null;
  groupAheadParticipant: GroupLiveStanding | null;
  groupBehindParticipant: GroupLiveStanding | null;
  groupStatusAlert: MatchStatusAlert | null;
  isLeavingGroupMatch: boolean;
  groupLiveStandings: GroupLiveStanding[];
  currentGroupLeader: GroupLiveStanding | null;
  onContinueSoloFromMatch: (source: MatchExitSource) => void;
};
