import type { ArenaParticipant } from '@/components/matches/liveMatchArena/types';
import type { RunMatchResult } from '@/domain';
import type { GroupLiveStanding } from '@/features/runs/types/matchProgress';
import type { RunningMatchLiveStatus } from '@/lib/api/types';

export type MatchResultTone = NonNullable<RunMatchResult['resultTone']>;

export type DuelMatchResultRowLabel = 'WIN' | 'LOSER' | 'DRAW' | 'ING';

export type DuelMatchResultRowModel = {
  id: string;
  resultLabel: DuelMatchResultRowLabel;
  name: string;
  paceLabel: string;
  durationLabel: string;
  distanceKm: number;
  isCurrentUser: boolean;
  isInProgress?: boolean;
};

export type GroupMatchResultRowModel = {
  id: string;
  rank: number;
  name: string;
  paceLabel: string;
  durationLabel: string;
  distanceKm: number;
  isCurrentUser: boolean;
  liveStatus?: RunningMatchLiveStatus;
  isInProgress?: boolean;
};

export type DuelMatchFinishModel = {
  title: string;
  summary: string;
  resultTone: MatchResultTone;
  badgeLabel: string;
  opponentDistanceKm: number;
  gapKm: number;
  matchResult: RunMatchResult;
  rows: DuelMatchResultRowModel[];
};

export type GroupMatchFinishModel = {
  title: string;
  summary: string;
  podium: GroupLiveStanding[];
  matchResult: RunMatchResult;
  rows: GroupMatchResultRowModel[];
  statusLabel: string | null;
};

export type ParticipantViewState =
  | 'running'
  | 'finished-self'
  | 'finished-other-visible'
  | 'finished-other-hidden';

export type MatchResultDisplayMode = 'duel' | 'group';

export type DuelResultLabel = 'WIN' | 'LOSE' | 'DRAW';

export type ParticipantLiveStatus = ArenaParticipant['liveStatus'];

export type ProgressiveParticipant = {
  isCurrentUser?: boolean;
  liveStatus?: ParticipantLiveStatus;
  rankLabel?: string;
  finishedAt?: string | null;
};

export type ParticipantViewStateInput = {
  participant: ProgressiveParticipant;
  isCurrentUserFinished: boolean;
};

export type ParticipantArenaLabel = {
  kind: 'rank' | 'result' | 'none';
  text: string;
};

export type DuelMatchResultRow = {
  id: string;
  resultLabel: DuelMatchResultRowLabel;
  name: string;
  paceLabel: string;
  durationLabel: string;
  isCurrentUser: boolean;
  isInProgress?: boolean;
};

export type GroupMatchResultRow = {
  id: string;
  rank: number;
  name: string;
  paceLabel: string;
  durationLabel: string;
  isCurrentUser: boolean;
  isInProgress?: boolean;
};
