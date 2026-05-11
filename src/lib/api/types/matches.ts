export type RunningMatchLiveStatus =
  | 'ready'
  | 'running'
  | 'background'
  | 'paused'
  | 'disconnected'
  | 'forfeited'
  | 'finished';

export type RequestDuelMatchInput = {
  distanceKm: number;
  slotStartAt: string;
  testMode?: boolean;
};

export type DuelMatchOpponent = {
  id: string;
  name: string;
  tag?: string;
  districtName: string;
  averagePace: string;
  levelLabel: string;
  weeklyDistanceKm: number;
  lifetimeDistanceKm: number;
  compatibilitySummary: string;
  accepted?: boolean;
  liveDistanceKm?: number;
  liveElapsedSeconds?: number;
  livePace?: string;
  liveUpdatedAt?: string;
  liveStatus?: RunningMatchLiveStatus;
  finishedAt?: string;
  officialDistanceKm?: number;
  officialElapsedSeconds?: number;
  officialAveragePace?: string;
  officialRank?: number;
  officialGapAheadKm?: number | null;
  officialGapLeaderKm?: number;
  officialComparedAt?: string;
  officialReady?: boolean;
};

export type RequestDuelMatchResponse = {
  success: boolean;
  matched: boolean;
  isTestMatch?: boolean;
  requestId: string;
  distanceKm: number;
  slotStartAt: string;
  slotLabel: string;
  paceBandLabel: string;
  levelBandLabel: string;
  criteriaSummary: string;
  estimatedWaitMinutes: number;
  opponent?: DuelMatchOpponent;
};

export type RequestGroupMatchInput = {
  distanceKm: number;
  slotStartAt: string;
  testMode?: boolean;
};

export type GroupMatchParticipant = {
  id: string;
  name: string;
  tag?: string;
  districtName: string;
  averagePace: string;
  levelLabel: string;
  weeklyDistanceKm: number;
  lifetimeDistanceKm: number;
  seedRank: number;
  seedSummary: string;
  accepted?: boolean;
  liveDistanceKm?: number;
  liveElapsedSeconds?: number;
  livePace?: string;
  liveUpdatedAt?: string;
  liveStatus?: RunningMatchLiveStatus;
  finishedAt?: string;
  officialDistanceKm?: number;
  officialElapsedSeconds?: number;
  officialAveragePace?: string;
  officialRank?: number;
  officialGapAheadKm?: number | null;
  officialGapLeaderKm?: number;
  officialComparedAt?: string;
  officialReady?: boolean;
};

export type RunningMatchState = 'idle' | 'waiting' | 'matched' | 'active';

export type FetchRunningMatchStatusInput = {
  mode: 'duel' | 'group';
  distanceKm: number;
  slotStartAt: string;
  testMode?: boolean;
  matchId?: string;
};

export type AcceptRunningMatchInput = {
  matchId: string;
};

export type CancelRunningMatchInput = {
  mode: 'duel' | 'group';
  distanceKm: number;
  slotStartAt: string;
  testMode?: boolean;
  matchId?: string;
};

export type LeaveRunningMatchInput = {
  matchId: string;
};

export type UpdateRunningMatchProgressInput = {
  matchId: string;
  distanceKm: number;
  elapsedSeconds: number;
  currentPace: string;
  status: Extract<RunningMatchLiveStatus, 'running' | 'background' | 'paused' | 'finished'>;
};

export type RunningMatchStatusResponse = {
  success: boolean;
  serverNow?: string;
  mode: 'duel' | 'group';
  state: RunningMatchState;
  isTestMatch?: boolean;
  matchId?: string;
  distanceKm: number;
  slotStartAt: string;
  slotLabel: string;
  paceBandLabel: string;
  levelBandLabel: string;
  criteriaSummary: string;
  estimatedWaitMinutes: number;
  participantCount: number;
  competitiveParticipantsCount?: number;
  acceptedCount: number;
  capacity: number;
  userAccepted: boolean;
  readyToStart: boolean;
  currentUserLiveStatus?: RunningMatchLiveStatus;
  canCancel?: boolean;
  cancelableUntilAt?: string;
  countdownRemainingSeconds?: number;
  countdownEndsAt?: string;
  expiresAt?: string;
  expiresInSeconds?: number;
  opponent?: DuelMatchOpponent;
  participants?: GroupMatchParticipant[];
  mySeedRank?: number;
  officialComparison?: {
    comparedAt: string;
    elapsedSeconds: number;
    participantCount: number;
    readyParticipantCount: number;
    userRank?: number;
    userDistanceKm?: number;
    userAveragePace?: string;
    leaderUserId?: string;
    leaderName?: string;
    leaderDistanceKm?: number;
    leaderAveragePace?: string;
    gapAheadKm?: number | null;
    gapLeaderKm?: number;
  };
};

export type UpcomingRunningMatchItem = {
  matchId: string;
  mode: 'duel' | 'group';
  isTestMatch?: boolean;
  distanceKm: number;
  slotStartAt: string;
  slotLabel: string;
  status: 'matched' | 'active';
  participantCount: number;
  counterpartLabel: string;
  summary: string;
  canCancel: boolean;
  cancelableUntilAt: string;
};

export type UpcomingRunningMatchesResponse = {
  serverNow?: string;
  items: UpcomingRunningMatchItem[];
};

export type CancelRunningMatchResponse = {
  success: boolean;
};

export type LeaveRunningMatchResponse = {
  success: boolean;
};

export type UpdateRunningMatchProgressResponse = RunningMatchStatusResponse;

export type RequestGroupMatchResponse = {
  success: boolean;
  matched: boolean;
  isTestMatch?: boolean;
  requestId: string;
  distanceKm: number;
  slotStartAt: string;
  slotLabel: string;
  paceBandLabel: string;
  levelBandLabel: string;
  criteriaSummary: string;
  estimatedWaitMinutes: number;
  maxGroupSize: number;
  participantsCount: number;
  mySeedRank?: number;
  participants: GroupMatchParticipant[];
};

export type FetchMatchDemandSummaryInput = {
  mode: 'duel' | 'group';
  distanceKm: number;
  slotStartAt: string;
};

export type MatchDemandSummaryResponse = {
  success: boolean;
  mode: 'duel' | 'group';
  distanceKm: number;
  slotStartAt: string;
  slotLabel: string;
  averagePace: string;
  participantsCount: number;
  competitiveParticipantsCount: number;
  capacity: number;
  fillRatioLabel: string;
  paceBandLabel: string;
  summaryText: string;
};
