export const RECOMMENDED_MATCH_DISTANCES = [3, 5, 7, 10, 15, 21.1, 42.195];
export const DUEL_MIN_COMPATIBILITY_SCORE = 72;
export const GROUP_MIN_COMPATIBILITY_SCORE = 68;
// Authoritative pace pairing gate (duel + group): two runners pair only when their
// average paces are within ±this many seconds/km. Matching is pace-only — level no
// longer gates. Default 15. Overridable via env for ON-DEVICE TESTING without code
// changes: set BACKEND_MATCH_PACE_TOLERANCE_SECONDS (e.g. 3600) in .env.production to
// widen it when test runs have polluted the last-3-run avg pace, then remove it to
// restore 15. Closest-pace-first ranking still applies among eligible candidates.
const PACE_TOLERANCE_OVERRIDE_SECONDS = Number(process.env.BACKEND_MATCH_PACE_TOLERANCE_SECONDS);
const MATCH_PACE_TOLERANCE_SECONDS = Number.isFinite(PACE_TOLERANCE_OVERRIDE_SECONDS)
  && PACE_TOLERANCE_OVERRIDE_SECONDS > 0
  ? PACE_TOLERANCE_OVERRIDE_SECONDS
  : 15;
export const DUEL_PACE_MATCH_TOLERANCE_SECONDS = MATCH_PACE_TOLERANCE_SECONDS;
// Group forms a 3-cluster all within ±tolerance of each other; later joiners within
// ±tolerance of the group anchor (avg pace of the founding 3). Same override applies.
export const GROUP_PACE_MATCH_TOLERANCE_SECONDS = MATCH_PACE_TOLERANCE_SECONDS;
export const GROUP_MIN_PARTICIPANTS = 3;
// Max runners a single forming/started group session may hold. Late joiners stop
// being admitted once a group reaches this size even if they are within ±15s of the
// anchor. Mirrors the response builder's long-standing maxGroupSize of 30 and the
// room cap (MATCH_ROOM_GROUP_MAX_PARTICIPANTS).
export const GROUP_MATCH_MAX_PARTICIPANTS = 30;
export const MATCH_BOOKING_WINDOW_DAYS = 7;
export const MATCH_BOOKING_CUTOFF_MS = 30 * 60 * 1000;
export const MATCH_PACE_BAND_OFFSET_MINUTES = 10 / 60;
export const MATCH_CANCELLATION_CUTOFF_MS = 60 * 60 * 1000;
export const MATCH_SESSION_ACTIVE_TTL_MS = 4 * 60 * 60 * 1000;
export const MATCH_SESSION_UNSTARTED_ACTIVE_GRACE_MS = 10 * 60 * 1000;
// POST-FINISH RETENTION (2026-07-09) — how long an ALL-done (every participant finished or
// forfeited) session stays in the store before pruning + tombstoning. Dropping it on the very
// next status lookup destroyed the slower finisher's own 'finished' echo whenever their finish
// POST landed but the response timed out client-side: their next 3s status poll pruned the
// session, received the idle-no-matchId payload, and the client contract read that as a
// vanished match (mid-run solo demotion → the run saved without its matchId). The window lets
// the device receive its echo/verdict via the direct-matchId status branch and lets the
// save-time PENDING blob heal against a live session. TTL expiry still bounds everything.
export const MATCH_SESSION_ALL_DONE_RETENTION_MS = 10 * 60 * 1000;

// DURABLE MATCH ROSTER (2026-08-11) — the session above is pruned ~10분 뒤 사라지지만,
// matchResult.matchId는 검증되지 않는 클라 입력이라 세션이 사라진 뒤의 저장은 "이 matchId로
// 기록을 올린 사람들"을 참가자로 오인했다(제3자가 남의 대결 판정을 영구히 뒤집을 수 있었다).
// 그래서 세션 생성 시점에 서버가 만든 참가자 명단을 별도 컬렉션에 박제해 prune을 살아남긴다.
//
// RETENTION의 시계는 '매칭 성사 시각'에서 시작한다 — matchmakingResponses가 두 러너가 짝지어진
// 즉시 createMatchSession을 부르고, 슬롯은 최대 MATCH_BOOKING_WINDOW_DAYS(7일) 앞서 예약되기
// 때문이다. 따라서 정당한 늦은 저장의 실제 최악은 [예약 선행 ≤7일] + [러닝] + [클라 저장 대기열
// 7일] = 14일을 넘긴다. 적대 검증 2026-08-11이 잡은 결함: 14일로 두면 7일 앞서 예약된 대결의
// 마지막 합법 드레인(14.04일째)이 로스터 만료 뒤에 도착해, 진짜 승자가 0P PENDING으로 굳는다.
// (createdAt을 slotStartAt으로 옮기는 대신 보존기간을 늘린 이유: 항목의 시간 단조성이 깨지면
// pruneMatchRosters의 O(1) prefix-drop이 성립하지 않는다.)
export const MATCH_ROSTER_RETENTION_MS = (MATCH_BOOKING_WINDOW_DAYS + 14) * 24 * 60 * 60 * 1000;
// LEGACY 유예 — 로스터가 "없다"는 사실의 의미가 시간에 따라 달라진다. 배포 직후에는 배포 전에
// 만들어진 매치라는 뜻이므로 기존 동작을 보존해야 하고(정당한 늦은 저장), epoch가 이 유예를
// 넘기면 정당한 저장은 전부 자기 로스터를 갖고 있을 수밖에 없으므로 로스터 없는 matchId는
// 위조이거나 고대 기록이다 → PENDING(안전). 즉 legacy 구멍이 7일 뒤 스스로 닫힌다.
// 클라 대기열 상한과 같은 값이어야 한다 — 그게 "정당한 늦은 저장"의 실제 상한이기 때문.
export const MATCH_ROSTER_LEGACY_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
// 블롭 비대화 상한 (#209: 블롭이 커지면 FOR UPDATE 락이 길어지고 쓰기 컨보이가 생긴다).
// 실측: 듀얼 항목 147바이트, 30인 그룹 항목 598바이트 → 5,000건의 듀얼 기준 최악 ≈ 718KB.
// 상한을 넘겨 축출된 매치는 "로스터 없음"이 되고, epoch 성숙 후에는 PENDING(안전)으로 떨어진다
// — 절대 무방비 경로로 떨어지지 않는다.
export const MATCH_ROSTER_MAX_ENTRIES = 5000;

export const MATCH_PARTICIPANT_RUNNING_STALE_MS = 90 * 1000;
export const MATCH_PARTICIPANT_BACKGROUND_STALE_MS = 20 * 60 * 1000;
export const MATCH_TEST_COUNTDOWN_SECONDS = 30;
export const MATCH_TEST_MAX_WAIT_MS = 30 * 60 * 1000;
export const MATCH_TEST_GROUP_MIN_PARTICIPANTS = 2;
export const MATCH_ROOM_HOST_START_DELAY_SECONDS = 10;
// All participants ready -> shared countdown poll-in buffer before the visible 10s countdown starts.
// 5s (not 2) so even the arm-rebuild worst case leaves enough buffer for the guest's clock-sync +
// lobby->running route + tab mount to finish DURING the 로딩중 hold, before the visible 10s
// countdown begins (otherwise the digit appears mid-route and diverges across phones).
export const MATCH_ROOM_HOST_LOADING_SECONDS = 5;
// Safety ceiling for host-start loading if a participant never acknowledges countdown readiness.
// ALSO the 로딩중 buffer the start action bakes into the slot (slot = press + this + the visible
// 10s). 2026-07-03 on-device measurement (IMG_0800/0801): the GUEST's lobby learned host-start
// 12-14s after press two runs in a row and joined mid-count at digit 6/4 — 8s did not cover it.
// 14 puts the visible digit start (slot-10 = press+14) at/after the measured worst-case learn
// time, so every phone shows 10→0 together even while delivery is slow. Dial back toward 8 once
// the arm-delivery trace pins and fixes the real latency source.
export const MATCH_ROOM_HOST_MAX_LOADING_WAIT_SECONDS = 14;
// A group party-run room (그룹대결) must seat more than two runners — otherwise it
// is just a duel. This is the floor for both the start gate and the room capacity.
export const MATCH_ROOM_GROUP_MIN_PARTICIPANTS = 3;
export const MATCH_ROOM_GROUP_DEFAULT_PARTICIPANTS = 10;
export const MATCH_ROOM_GROUP_MAX_PARTICIPANTS = 30;
// 시작 전 대기방의 수명 — 마지막 '활동'(생성/참가/준비/설정변경) 기준. 24시간
// (MATCH_ROOM_IDLE_TTL_MS)은 대기실의 실사용 수명과 맞지 않았다: 어제 만들고 잊은 유령
// 대기방이 오늘의 매칭을 통째로 막고("이미 참여 중인 1대1 방이 있어요"), 관리자 라이브
// 화면에도 '대기 중인 파티방'으로 계속 남는다. 대기실은 실시간 합류 수단이므로 2시간 동안
// 아무 일도 없었으면 죽은 방으로 본다. 만료되면 prune이 방을 실제로 지운다 — 앱이 "열린
// 방이 없어요"라고 말하면 서버에도 정말 없어야 한다는 게 이 상수의 계약이다.
export const MATCH_ROOM_WAITING_TTL_MS = 2 * 60 * 60 * 1000;
export const MATCH_ROOM_INVITE_LINK_BASE = 'runningground://running';
// 5m: GPS discreteness + toFixed(2) display rounding boundary only — so a 5km race finishes
// at ~4.995km (displays 5.00), not 20m early at 4.98km. Keep aligned with the client constant.
export const MATCH_GOAL_DISTANCE_TOLERANCE_KM = 0.005;
export const MATCH_PROGRESS_MAX_SPEED_MPS = 12;
export const MATCH_PROGRESS_MAX_SPEED_KM_PER_SECOND = MATCH_PROGRESS_MAX_SPEED_MPS / 1000;
// CHECKPOINT-FAIR LIVE COMPARE (2026-07-09) — the server buckets the 2.5s progress pushes it
// already receives onto a coarse 10s grid so the head-to-head (duel dots/gap, group
// rankings/rows/남은거리) compares BOTH runners at the LATEST COMMON checkpoint instead of a
// per-runner linear projection. Index k = floor(elapsedSeconds / STEP) encodes grid time
// T = (k+1)*STEP, so no per-entry timestamp is stored — checkpoints is a compact number[]
// (distanceKm at 2dp). The MY hero number/time/pace stays LIVE (GPS-fed) and the final
// win/lose verdict stays server-authoritative on finishElapsedSeconds; only the compared
// distance is quantized. MAX caps the array so the hot whole-store serialize stays cheap.
// 120 = 20 min of grid — NOT past every real race (2026-08-11: a 33-min 6km race saturated it
// and froze the race board). Past saturation matchSessionSnapshots degrades the compare to the
// continuous projection path, so raising MAX buys checkpoint fairness, not liveness.
export const MATCH_CHECKPOINT_STEP_SECONDS = 10;
// 120 → 360 (2026-08-22, 60분 지평). 20분 격자는 이 앱의 실제 러닝 길이를 담지 못해서, 대부분의
// 파티런이 후반 내내 투영 경로에서 비교됐다. 그 경로의 공통 경과는 **둘 중 늦게 보고한 쪽**에
// 묶이므로, 상대 폰이 잠들어 보고가 끊기는 동안 내 거리가 그 침묵만큼 비례로 깎인다 — 8/21
// 파티런에서 깨울 때마다 보드가 내 기록보다 0.3~0.4km 뒤처져 보이고(침묵 한도 90초 × 파티런
// 속도) 상대가 다시 보고하면 도로 붙던 것이 정확히 이 산수였다. 격자 안에서는 두 사람의
// '같은 초'에 실제로 기록된 거리끼리 비교하므로 투영도, 그 침묵 비례 축소도 없다.
//
// 비용은 참가자당 배열 240칸(2dp 숫자 ≈ 6바이트 → ~1.4KB), 진행 중인 매치에만. 더 긴 지평이
// 필요해지면 MAX가 아니라 STEP을 키우는 게 옳다 — 같은 지평을 배열 크기 그대로 산다.
export const MATCH_CHECKPOINT_MAX = 360;
// Once one duel runner finishes, the other has a bounded window to land their own
// finish before the server resolves the duel server-side (missing runner = DNF) so
// neither client is stranded on a 'pending' verdict forever. Sized to the running
// stale window so a runner who genuinely stopped reporting is treated as a DNF.
export const MATCH_DUEL_FINISH_FALLBACK_MS = MATCH_PARTICIPANT_RUNNING_STALE_MS;
// A §B4 fallback seal is PROVISIONAL for this long (measured from the seal's
// resolvedAt): a sealed-DNF runner whose finish was merely delayed (iOS screen-off
// upload freeze can lag minutes) may still land a plausible finish inside this
// window, which ANNULS the seal and lets measured-elapsed truth re-resolve the
// match (the winner can flip at most once). LP, result notifications, and the
// saved-run back-fill are all deferred to the window close (finalization), so
// nothing irreversible ever happens off a provisional verdict. Covers the observed
// 2-10min screen-on lag while staying far below the 4h session TTL.
export const MATCH_SEAL_REVISION_WINDOW_MS = 10 * 60 * 1000;
