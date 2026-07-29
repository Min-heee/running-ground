export type FriendRank = {
  id: string;
  rank: number;
  name: string;
  tag?: string;
  // 프로필 상태메시지 — 친구 목록에서 이름 옆에 보여준다 (구버전 서버는 안 보냄).
  statusMessage?: string;
  // 지역 표시 라벨 (시/도 시군구 동) — 프로필 화면용 (구버전 서버는 안 보냄).
  regionLabel?: string;
  // 친구 카드 행의 컴팩트 표시: 동 단위 지역 + 랭크 티어 (구버전 서버는 안 보냄).
  districtName?: string;
  rankTier?: string;
  // Weekly competitive aggregates — the server's rank order is based on these.
  distanceKm: number;
  points: number;
  // Real KST-anchored 오늘/이번 달 aggregates. Optional because a client updated
  // via OTA can briefly talk to a backend that predates them — the window tabs
  // fall back conservatively instead of fabricating numbers.
  todayDistanceKm?: number;
  todayPoints?: number;
  monthDistanceKm?: number;
  monthPoints?: number;
  isRunningNow?: boolean;
  liveLocationLabel?: string;
};

export type FriendRequestStatus = 'pending' | 'received' | 'accepted';

export type FriendRequest = {
  id: string;
  name: string;
  tag: string;
  status: FriendRequestStatus;
};

export type FriendRunRecord = {
  id: string;
  date: string;
  distanceKm: number;
  pace: string;
};
