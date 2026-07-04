import type { ArenaParticipant } from '@/components/matches/liveMatchArena/types';
import type { RunMatchResult } from '@/domain';
import type { GroupLiveStanding } from '@/features/runs/types/matchProgress';
import type { RunningMatchLiveStatus } from '@/lib/api/types';

export type MatchResultTone = NonNullable<RunMatchResult['resultTone']>;

export type DuelMatchResultRowLabel = 'WIN' | 'LOSER' | 'DRAW' | 'ING' | 'FORFEIT';

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
  // Fair-verdict display notices, derived from the ADDITIVE server verdict flags — both
  // stay absent against an old backend (render nothing then). Display-only: NOT part of
  // matchResult, so a provisional outcome is never persisted from the client.
  // provisional → "가확정 · 상대 기록 수신 대기 중"; revised → the one-line 정정 reason banner.
  provisionalNoticeLabel?: string | null;
  revisedNoticeLabel?: string | null;
};

export type GroupMatchFinishModel = {
  title: string;
  summary: string;
  podium: GroupLiveStanding[];
  matchResult: RunMatchResult;
  rows: GroupMatchResultRowModel[];
  statusLabel: string | null;
  // Fair-verdict display notice (group seals carry only `provisional`; see the duel twin).
  provisionalNoticeLabel?: string | null;
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
