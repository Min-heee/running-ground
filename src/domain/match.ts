export type RunMatchSource = 'official' | 'party';

export type RunMatchResult = {
  mode: 'duel' | 'group';
  source?: RunMatchSource;
  // Persisted on the run record's matchResult JSON blob (run.matchResult.matchId).
  // Lets a saved record open the dedicated match-result screen, which always fetches
  // the authoritative per-participant result by matchId.
  matchId?: string;
  title: string;
  summary: string;
  badgeLabel: string;
  opponentId?: string;
  opponentName?: string;
  resultTone?: 'win' | 'lose' | 'draw';
  rank?: number;
  participantCount?: number;
  gapKm?: number;
  comparedDistanceKm?: number;
  myPaceLabel?: string;
  myDurationSeconds?: number;
  opponentPaceLabel?: string;
  opponentDurationSeconds?: number;
  // Fair-verdict display-only flags. Set ONLY on the run-detail reconcile OVERLAY (the
  // in-memory record rebuilt from the server's /status verdict or /result response) — the
  // client never persists them, so a provisional outcome can never be written into a saved
  // blob (write-once heal semantics preserved). provisional → 가확정 badge; revised → the
  // one-line 정정 reason banner.
  provisional?: boolean;
  revised?: boolean;
};

export type OfflineRaceStatus =
  | 'registration_open'
  | 'registration_closing'
  | 'registration_closed'
  | 'live'
  | 'finished';

export type OfflineRaceParticipantPreview = {
  id: string;
  name: string;
  paceGoal: string;
  regionLabel: string;
};

export type OfflineRaceEvent = {
  id: string;
  title: string;
  subtitle: string;
  distanceKm: number;
  startsAt: string;
  registrationClosesAt: string;
  participationMode: string;
  proofMethod: string;
  runWindowMinutes: number;
  hostLabel: string;
  participantCount: number;
  capacity: number;
  entryFeePoints: number;
  operationNote: string;
  registered: boolean;
  status: OfflineRaceStatus;
  participantPreview: OfflineRaceParticipantPreview[];
};

export type OfflineRacePastEvent = {
  id: string;
  title: string;
  distanceKm: number;
  finishedAt: string;
  modeLabel: string;
  winnerName: string;
  finishers: number;
  summary: string;
};

export type OfflineRaceHub = {
  featuredEvent: OfflineRaceEvent | null;
  upcomingEvents: OfflineRaceEvent[];
  pastEvents: OfflineRacePastEvent[];
  guideSteps: string[];
};
