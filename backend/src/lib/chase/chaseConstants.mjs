// 경찰과 도둑런 (chase) 튜닝 상수 — 오너 확정값 2026-07-27.
// 판정은 전부 서버 소급 정산이므로 여기 숫자만 바꾸면 밸런스 조정 끝.

// 보상
export const CHASE_CATCH_POINTS = 10; // 따라잡기(체포): 잡은 쪽만
export const CHASE_MEET_POINTS = 5; // 마주침(조우): 양쪽 다
export const CHASE_MAX_RUN_BONUS_POINTS = 30; // 러닝 1회당 상한
export const CHASE_MAX_DAILY_BONUS_POINTS = 60; // KST 하루 상한

// 스침 판정 기하
export const CHASE_ENCOUNTER_DISTANCE_M = 25; // 이 거리 안이면 조우 후보
export const CHASE_SAMPLE_STEP_MS = 2_500; // 두 경로를 2.5초 간격으로 겹쳐본다 (6.5m/s 정면 스침 창 3.8초도 반드시 샘플)
export const CHASE_MAX_INTERP_GAP_MS = 30_000; // GPS 공백이 이보다 크면 보간 금지
export const CHASE_EPISODE_GAP_MS = 15_000; // 후보 샘플이 이만큼 끊기면 에피소드 종료
export const CHASE_HEADING_WINDOW_MS = 20_000; // 진행 방향은 ±20초 변위로 계산 (물가 멀티패스 드리프트가 만드는 가짜 속도/방향 완화)
export const CHASE_MEET_MIN_ANGLE_DEG = 100; // 방향차가 이 이상이면 마주침
export const CHASE_CATCH_MAX_ANGLE_DEG = 60; // 이 이하(같은 방향)일 때만 추월 검사
// 진짜 정면 스침은 25m 창을 몇 초 만에 지나간다 (둘 다 최저 1.0m/s여도 25초).
// 나란히 달리는 친구들의 '긴' 근접 에피소드가 노이즈로 마주침 오판되는 것을 차단.
export const CHASE_MEET_MAX_EPISODE_MS = 30_000;
export const CHASE_OVERTAKE_MARGIN_M = 12; // 앞뒤 역전 판정 여유 (전 -12m → 후 +12m; GPS 노이즈가 ±5m는 넘나들 수 있어 상향)
export const CHASE_OVERTAKE_LOOKAROUND_MS = 15_000; // 역전 확인은 에피소드 앞뒤로 15초 확장

// 어뷰징 방지
export const CHASE_MIN_MOVING_SPEED_MPS = 1.0; // 둘 다 이 이상 이동 중이어야 함 (벤치 파밍 차단)
export const CHASE_MAX_HUMAN_SPEED_MPS = 6.5; // 초과 지속은 자전거/차량으로 보고 제외
export const CHASE_PAIR_COOLDOWN_MS = 15 * 60 * 1_000; // 같은 두 사람은 15분에 1회만 득점

// 경기장 점유(정원)
export const CHASE_PRESENCE_TTL_MS = 3 * 60 * 60 * 1_000; // 입장 슬롯 수명 (러닝 업로드 시 조기 반납)
// 라이브 지도: 이보다 오래된 위치는 지도에서 숨긴다 (주머니 속 아이폰은 업로드가 멈추므로
// 마지막 위치가 낡는다 — 신선도는 ageSeconds로 클라에 전달).
export const CHASE_POSITION_STALE_MS = 10 * 60 * 1_000;
// 위치 하트비트 지오펜스 여유 — 이 밖에서 보낸 좌표는 거부 (집에서 슬롯을 만들어
// 라이브 지도를 훔쳐보는 원격 스토킹 차단; GPS 흔들림은 여유로 흡수).
export const CHASE_POSITION_GEOFENCE_MARGIN_M = 150;
// 하트비트가 '새로' 만드는 슬롯(중도 TTL 만료 자가회복)은 짧게 산다 — 저장 직후 늦게 도착한
// 하트비트가 부활시킨 고스트 슬롯이 3시간 대신 15분 만에 소멸. 진짜 러너는 10초마다
// 갱신(full TTL)하므로 영향 없음.
export const CHASE_POSITION_SLOT_TTL_MS = 15 * 60 * 1_000;

// 정산 원장 — 러닝 쌍은 정확히 1번만 정산 (재업로드/dedupe 재시도 이중 지급 방지)
export const CHASE_PAIR_LEDGER_TTL_MS = 3 * 24 * 60 * 60 * 1_000;

// 경기장 경계 밖 살짝(GPS 오차)은 봐준다
export const CHASE_ARENA_BOUNDARY_MARGIN_M = 50;
