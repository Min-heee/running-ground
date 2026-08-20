// 우주 탭 — 지역 트리를 천체로 읽은 응답 (백엔드 lib/universeBuilder.mjs와 1:1).
//
// scale/brightness는 서버가 계산해서 내려준다. 수축 보정·로그 압축을 클라에서 다시 하면
// 두 곳이 어긋나므로 화면은 받은 숫자를 그리기만 한다.

export type UniverseLevel = 'cluster' | 'group' | 'galaxy';

export type UniverseBreadcrumbNode = {
  id: string;
  name: string;
  level: UniverseLevel;
};

export type UniverseNode = UniverseBreadcrumbNode & {
  memberCount: number;
  totalDistanceKm: number;
  averageDistanceKm: number;
  participationRate: number;
  stars: number;
};

// 은하군·은하 — 크기는 인당 평균(수축 보정), 밝기는 총거리(로그).
export type UniverseBody = UniverseNode & {
  scale: number;
  brightness: number;
  isMine: boolean;
};

// 행성(개인) — 크기는 평생 누적 총거리(로그), 밝기는 이번 달 거리(로그).
export type UniversePlanet = {
  userId: string;
  userName: string;
  lifetimeDistanceKm: number;
  monthDistanceKm: number;
  scale: number;
  brightness: number;
  stars: number;
  // 그 은하의 누적(평생) 거리 1등 = 항성. 은하마다 정확히 하나(전원 0km면 없음).
  isStar: boolean;
  isMine: boolean;
};

export type UniverseNebula = {
  memberCount: number;
  totalLifetimeDistanceKm: number;
};

export type UniverseGalaxy = {
  planets: UniversePlanet[];
  // 렌더 상한을 넘은 회원들 — 한 덩어리 성운으로 접힌다.
  nebula: UniverseNebula | null;
};

export type UniverseMe = {
  userId: string;
  // '내 행성으로' 워프 목적지 — 지역 미설정이면 null.
  galaxyNodeId: string | null;
  galaxyName: string | null;
};

// 검색 결과 — 좌표가 아니라 '어느 은하로 가야 하나'만 온다. 좌표는 화면 크기·회원 수마다
// 달라져 서버가 알 수 없다 (백엔드 lib/universeSearch.mjs).
export type UniverseSearchResult = {
  userId: string;
  userName: string;
  galaxyNodeId: string;
  galaxyName: string;
  // '서울특별시 · 송파구' — 같은 이름의 동네를 구분해서 읽히게.
  regionPath: string;
  monthDistanceKm: number;
  isMine: boolean;
};

export type UniverseSearchResponse = {
  query: string;
  results: UniverseSearchResult[];
};

export type UniverseResponse = {
  level: UniverseLevel;
  node: UniverseNode;
  breadcrumb: UniverseBreadcrumbNode[];
  nationwideAverageDistanceKm: number;
  me: UniverseMe;
  bodies: UniverseBody[];
  galaxy: UniverseGalaxy | null;
};
