// 크루대전 (오너 2026-09-18): 전국 크루가 한 순위표에 오르는 월간 크루 리그.
// 시즌 = KST 달력 한 달, 순위 = 크기를 보정한 '보정 인당 km', 1위 크루가 별 ★을 받는다.
// 포인트는 없다 — 별과 기록뿐. 아래 모양은 백엔드 응답과 1:1 계약이라 필드를 임의로 바꾸지 않는다.

export type CrewUnrankedReason = 'too_few_members' | 'no_distance' | 'newcomers_pending';

export type CrewSeasonInfo = {
  seasonKey: string;          // 'YYYY-MM'
  label: string;              // '11월 시즌' | '9월 프리시즌'
  isPreseason: boolean;       // 9·10월 (오너 2026-09-18 연장) — 별·7일 규칙 없음
  // 아래 둘은 프리시즌 연장 때 더한 필드라 그 전 백엔드(86c4a059) 응답엔 없다 — 백엔드 롤백·배포
  // 지연에도 크루 탭이 죽지 않게 옵셔널로 두고 crewModel의 resolve 함수로만 읽는다.
  isFirstSeason?: boolean;     // 이전 시즌이 없는 달(2026-09) — '지난 시즌' 빈 문구용
  firstStarSeasonKey?: string; // 'YYYY-MM' 별을 주는 첫 시즌 — '별은 N월 시즌부터'
  startsAt: string; endsAt: string; sealsAt: string;   // ISO
  daysLeft: number;           // whole KST days until endsAt, 0 when tallying/sealed
  priorKm: number;            // fixed P
  status: 'live' | 'tallying' | 'sealed';
};

export type CrewSummary = {
  id: string; name: string; stars: number; memberCount: number; captainName: string;
};

export type CrewStandingRow = {
  crewId: string; name: string; stars: number;
  rank: number | null;        // null = unranked
  score: number;              // 보정 인당 km
  totalKm: number; seasonMemberCount: number; runnerCount: number;
  unrankedReason: CrewUnrankedReason | null;
  isMine: boolean;
};

export type CrewMemberRow = {
  userId: string; name: string; role: 'captain' | 'member';
  contributionKm: number;     // this season: app + imported runs (not manual), overlaps deduped, no daily cap
  countsFrom: string;         // ISO
  countedFrom: string | null; // ISO when this member enters N (7-day rule); null = already counted
  isMe: boolean;
};

export type MyCrew = {
  crew: CrewSummary; inviteCode: string; role: 'captain' | 'member';
  standing: CrewStandingRow; members: CrewMemberRow[];
  pendingRequestCount: number;   // 0 for non-captains
};

export type CrewPendingRequest = { requestId: string; crewId: string; crewName: string; createdAt: string };

export type CrewHomeResponse = {
  season: CrewSeasonInfo;
  myCrew: MyCrew | null;
  top: CrewStandingRow[];         // top 5 ranked of the live season
  rankedCrewCount: number;
  lastSeason: { seasonKey: string; label: string; champions: { crewId: string; name: string }[] } | null;
  myPendingRequest: CrewPendingRequest | null;
  joinsLeftThisMonth: number;
};

export type CrewLeagueResponse = {
  season: CrewSeasonInfo; sealed: boolean;
  ranked: CrewStandingRow[]; unranked: CrewStandingRow[];
};

export type CrewDetailResponse = {
  crew: CrewSummary; standing: CrewStandingRow; members: CrewMemberRow[];
  canRequest: boolean; myRequestPending: boolean;
};

export type CrewSearchResponse = { crews: (CrewSummary & { rank: number | null })[] };

export type CrewPreviewResponse = { crew: CrewSummary; standing: CrewStandingRow };

export type CrewJoinRequestRow = { requestId: string; userId: string; name: string; createdAt: string };

export type CrewRequestsResponse = { requests: CrewJoinRequestRow[] };
