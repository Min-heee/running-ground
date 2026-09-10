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
  // Full hierarchy label ("전남광주통합특별시 동구") — optional until the backend ships it.
  regionLabel?: string;
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
  forfeitedAt?: string;
  // 부정 러닝 실격 (오너 규칙 2026-09-09): liveStatus 'forfeited'에 얹히는 부가 플래그.
  // 서버가 reason:'disqualified' 이탈에만 true로 준다 — 표시는 '기권' 대신 '실격'.
  disqualified?: boolean;
  officialDistanceKm?: number;
  officialElapsedSeconds?: number;
  officialAveragePace?: string;
  officialRank?: number;
  officialGapAheadKm?: number | null;
  officialGapLeaderKm?: number;
  officialComparedAt?: string;
  officialReady?: boolean;
  // Frozen MEASURED finish elapsed (the duel rank key) — null for non-finishers/forfeiters.
  // Additive; do NOT derive winner from finishedAt ordering anymore.
  finishElapsedSeconds?: number | null;
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
  forfeitedAt?: string;
  // 부정 러닝 실격 — DuelMatchOpponent.disqualified와 같은 계약.
  disqualified?: boolean;
  officialDistanceKm?: number;
  officialElapsedSeconds?: number;
  officialAveragePace?: string;
  officialRank?: number;
  officialGapAheadKm?: number | null;
  officialGapLeaderKm?: number;
  officialComparedAt?: string;
  officialReady?: boolean;
  // Frozen MEASURED finish elapsed (the rank key) — null for non-finishers/forfeiters.
  finishElapsedSeconds?: number | null;
};

export type DuelVerdictOutcome = 'win' | 'lose' | 'draw' | 'pending';

// Server-authoritative duel resolution. Additive: omitted by older backends, in which
// case the client must fall back to its local distance/finish-order heuristics. When
// present, it is the single source of truth for win/lose/draw and the official frozen
// finish times + paces (both derived from the SAME official numbers so the two phones
// can never disagree). `resolved === false` (outcome === 'pending') means the duel is
// still pending — render a placeholder, never a fabricated 승/패.
export type DuelVerdict = {
  resolved: boolean;
  winnerUserId: string | null;
  outcome: DuelVerdictOutcome;
  myFinishElapsedSeconds: number | null;
  opponentFinishElapsedSeconds: number | null;
  myPaceLabel: string | null;
  opponentPaceLabel: string | null;
  // Fair-verdict §2-4 (additive; absent on older backends — render nothing then).
  // provisional: the verdict came from the one-finisher fallback seal and is still inside
  // the server's revision window — display it with a 가확정 badge, never as final.
  provisional?: boolean;
  // revised: a late finish inside the revision window flipped the sealed winner; show a
  // one-line 정정 reason banner. Set only when the winner actually changed.
  revised?: boolean;
  revisedAt?: string;
};

// One participant's sealed slot in the group's final ordering.
export type GroupVerdictParticipant = {
  userId: string;
  // Server-authoritative 1-based placement (null only when unresolved/unranked).
  rank: number | null;
  finishElapsedSeconds: number | null;
  paceLabel: string | null;
  forfeited: boolean;
  finished: boolean;
};

// Server-authoritative group FINAL placement — the parity twin of DuelVerdict (mode === 'group'
// only). Additive: omitted by older backends, in which case the client must fall back to a PENDING
// placeholder rather than a fabricated local rank. When present, it is the single source of truth
// for every participant's final placement, so a not-yet-synced / screen-off rival can never produce
// a divergent local rank. `resolved === false` means the group is still settling — render the
// PENDING placeholder, never a final 순위. `myRank` is the requesting user's sealed placement (null
// until resolved).
export type GroupVerdict = {
  resolved: boolean;
  participants: GroupVerdictParticipant[];
  myRank: number | null;
  // Fair-verdict §2-4 (additive; absent on older backends — render nothing then). True while
  // the sealed group ordering is still inside the server's revision window — display the
  // placement with a 가확정 badge, never as final.
  provisional?: boolean;
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
  // 부정 러닝 실격 기권 (케이던스 워치독): 서버는 forfeited + disqualified:true 로 기록하고
  // 이 러너의 매치 포인트를 0으로 만든다. 없으면 오늘의 일반 기권 그대로.
  reason?: 'disqualified';
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
  // Server-authoritative duel resolution (mode === 'duel' only). Additive: omitted by
  // older backends — when absent the client falls back to its local heuristics.
  duelVerdict?: DuelVerdict;
  // Server-authoritative group FINAL placement (mode === 'group' only). Additive: omitted
  // by older backends — when absent the client renders a PENDING placeholder rather than a
  // fabricated local rank.
  groupVerdict?: GroupVerdict;
  // The requesting user's OWN frozen MEASURED finish elapsed (seconds). Omitted until the
  // user finishes. Self-counterpart to opponent.finishElapsedSeconds; render this as the
  // official finish time instead of a local stopwatch value.
  currentUserFinishElapsedSeconds?: number;
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
  // 레이스 이벤트 편성 세션이면 이벤트 정체 — 홈 카드 라벨/대기실 라우팅용 (오너 2026-08-13).
  raceEventId?: string;
  raceEventTitle?: string;
  roomId?: string;
  // 친구끼리의 파티런 예약(2026-09-09) — 카드 라벨·리마인더 카피용. roomId와 함께 온다.
  isPartyRun?: boolean;
  // 내가 그 대기방의 방장인가 — 취소하면 예약 전체가 사라지는지(방장), 나만 빠지는지(게스트)를
  // 확인 문구가 정확히 말하기 위해 (2026-09-10).
  isRoomHost?: boolean;
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
  // Count of people currently searching a 1:1 (duel) match per slot, keyed by the
  // slot's start-at ISO string. Additive: omitted by older backends — when absent the
  // slot selector simply renders no waiting-count line.
  duelSlotCounts?: Record<string, number>;
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

// ---------------------------------------------------------------------------
// Final match-result-by-matchId endpoint: GET /running/matches/:matchId/result
// Always fetched by matchId from the backend (no reliance on in-memory live
// state), so the result screen renders identically from both the live arena and
// a saved/old record. Pace/time are the OFFICIAL frozen values — never recomputed.
// ---------------------------------------------------------------------------

export type MatchResultMode = 'duel' | 'group';

export type MatchResultSource = 'official' | 'party';

export type MatchResultParticipantTone = 'win' | 'lose' | 'draw';

export type MatchResultParticipant = {
  // null only for a reconstructed opponent row in the saved-record fallback when
  // the opponent never saved a run (synthetic/bot or unsaved).
  userId: string | null;
  name: string;
  districtName: string | null;
  provinceName: string | null;
  cityName: string | null;
  // Official frozen pace in seconds/km, else null.
  paceSecondsPerKm: number | null;
  finishElapsedSeconds: number | null;
  distanceKm: number;
  // Official 1-based; duel winner = 1. null when unranked.
  rank: number | null;
  // duel only; null for group rows.
  resultTone: MatchResultParticipantTone | null;
  forfeited: boolean;
  // 부정 러닝 실격으로 기권 처리된 참가자 — forfeited와 함께 true. 표시는 '실격'.
  disqualified?: boolean;
  isMe: boolean;
};

export type MatchResultResponse = {
  matchId: string;
  mode: MatchResultMode;
  source: MatchResultSource;
  comparedDistanceKm: number;
  // Ordered by rank ascending (winner/1등 first); duel has exactly 2.
  participants: MatchResultParticipant[];
  // Fair-verdict §2-5 (additive; absent on older backends — render nothing then).
  // provisional: the result reflects a one-finisher fallback seal still inside the server's
  // revision window — badge it 가확정, never treat it as final.
  provisional?: boolean;
  // revised: a late finish inside the revision window flipped the sealed winner — show the
  // one-line 정정 reason banner.
  revised?: boolean;
  revisedAt?: string;
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
