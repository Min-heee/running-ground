// 경찰과 도둑런 경기장 카탈로그 — 코드 상수가 단일 소스 (MVP: 어드민 편집 없음,
// 추가/수정은 백엔드 배포로). 반경은 공원 전체 + 산책로를 넉넉히 덮는 원형 지오펜스.
// 좌표를 바꿀 때는 공원 중심(호수/잔디밭)에 맞추고, 강변 선형 공원은 중앙 구간 기준.

export const CHASE_ARENAS = [
  { id: 'ilsan-lake', name: '일산 호수공원', regionLabel: '고양', latitude: 37.6585, longitude: 126.7676, radiusM: 900, capacity: 100 },
  { id: 'yeouido-han', name: '여의도 한강공원', regionLabel: '서울 영등포', latitude: 37.5285, longitude: 126.9337, radiusM: 1300, capacity: 100 },
  { id: 'banpo-han', name: '반포 한강공원', regionLabel: '서울 서초', latitude: 37.5099, longitude: 126.9957, radiusM: 1200, capacity: 100 },
  { id: 'ttukseom-han', name: '뚝섬 한강공원', regionLabel: '서울 광진', latitude: 37.5296, longitude: 127.0668, radiusM: 1200, capacity: 100 },
  { id: 'jamsil-han', name: '잠실 한강공원', regionLabel: '서울 송파', latitude: 37.5183, longitude: 127.0822, radiusM: 1100, capacity: 100 },
  { id: 'mangwon-han', name: '망원 한강공원', regionLabel: '서울 마포', latitude: 37.5525, longitude: 126.8970, radiusM: 900, capacity: 80 },
  { id: 'olympic-park', name: '올림픽공원', regionLabel: '서울 송파', latitude: 37.5209, longitude: 127.1230, radiusM: 900, capacity: 100 },
  { id: 'seoul-forest', name: '서울숲', regionLabel: '서울 성동', latitude: 37.5444, longitude: 127.0374, radiusM: 600, capacity: 80 },
  { id: 'seokchon-lake', name: '석촌호수', regionLabel: '서울 송파', latitude: 37.5095, longitude: 127.1015, radiusM: 650, capacity: 80 },
  { id: 'dream-forest', name: '북서울꿈의숲', regionLabel: '서울 강북', latitude: 37.6206, longitude: 127.0413, radiusM: 600, capacity: 60 },
  { id: 'songdo-central', name: '송도 센트럴파크', regionLabel: '인천 연수', latitude: 37.3927, longitude: 126.6373, radiusM: 700, capacity: 80 },
  { id: 'gwanggyo-lake', name: '광교호수공원', regionLabel: '수원', latitude: 37.2846, longitude: 127.0662, radiusM: 800, capacity: 80 },
  { id: 'sejong-lake', name: '세종호수공원', regionLabel: '세종', latitude: 36.5021, longitude: 127.2762, radiusM: 800, capacity: 60 },
  { id: 'hanbat-expo', name: '한밭수목원', regionLabel: '대전 서구', latitude: 36.3675, longitude: 127.3885, radiusM: 700, capacity: 60 },
  { id: 'suseong-lake', name: '수성못', regionLabel: '대구 수성', latitude: 35.8279, longitude: 128.6183, radiusM: 500, capacity: 60 },
  { id: 'samnak-eco', name: '삼락생태공원', regionLabel: '부산 사상', latitude: 35.1710, longitude: 128.9680, radiusM: 1300, capacity: 80 },
  { id: 'ulsan-grand', name: '울산대공원', regionLabel: '울산 남구', latitude: 35.5295, longitude: 129.2940, radiusM: 1000, capacity: 60 },
  { id: 'pungam-lake', name: '풍암호수공원', regionLabel: '전남광주 서구', latitude: 35.1277, longitude: 126.8700, radiusM: 500, capacity: 60 },
  { id: 'deokjin-park', name: '덕진공원', regionLabel: '전주', latitude: 35.8480, longitude: 127.1224, radiusM: 450, capacity: 60 },
];

const ARENA_BY_ID = new Map(CHASE_ARENAS.map((arena) => [arena.id, arena]));

export function findChaseArena(arenaId) {
  return ARENA_BY_ID.get(String(arenaId ?? '')) ?? null;
}
