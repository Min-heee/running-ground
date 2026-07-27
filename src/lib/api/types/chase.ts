// 경찰과 도둑런(chase) API 타입 — backend/src/lib/chase/* 응답과 1:1.

export type ChaseArenaSummary = {
  id: string;
  name: string;
  regionLabel: string;
  latitude: number;
  longitude: number;
  radiusM: number;
  capacity: number;
  currentCount: number;
};

export type ChaseArenaListResponse = {
  arenas: ChaseArenaSummary[];
};

export type ChaseJoinResponse = {
  arenaId: string;
  arenaName: string;
  // 라이브 지도용 지오펜스 (서버 단일 소스) — 러닝 컨텍스트에 그대로 잠근다.
  latitude: number;
  longitude: number;
  radiusM: number;
  capacity: number;
  currentCount: number;
};

export type ChasePositionInput = {
  arenaId: string;
  latitude: number;
  longitude: number;
  headingDeg?: number | null;
  paceLabel?: string | null;
};

export type ChaseLiveParticipant = {
  userId: string;
  name: string;
  latitude: number;
  longitude: number;
  headingDeg: number | null;
  paceLabel: string | null;
  ageSeconds: number;
  isSelf: boolean;
};

export type ChaseLiveResponse = {
  arenaId: string;
  arenaName: string;
  latitude: number;
  longitude: number;
  radiusM: number;
  participants: ChaseLiveParticipant[];
};

export type ChaseLeaveResponse = {
  left: boolean;
};

export type ChaseRunEventType = 'catch' | 'meet';

export type ChaseRunEvent = {
  type: ChaseRunEventType;
  role: 'catcher' | 'caught' | 'meet';
  otherUserId: string;
  otherName: string;
  atIso: string;
  points: number;
};

// run.chase — 러닝에 박제된 경기장 태그 + 정산 누적.
export type RunChaseSummary = {
  arenaId: string;
  bonusPoints: number;
  events: ChaseRunEvent[];
};

// POST /runs/tracked 응답에 얹히는 즉시 정산 요약.
export type ChaseSettlementSummary = {
  arenaId: string;
  arenaName: string;
  newEvents: ChaseRunEvent[];
  totalBonusPoints: number;
};
