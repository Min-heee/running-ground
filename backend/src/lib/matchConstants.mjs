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
export const MATCH_ROOM_IDLE_TTL_MS = 24 * 60 * 60 * 1000;
export const MATCH_ROOM_INVITE_LINK_BASE = 'runningground://running';
// 5m: GPS discreteness + toFixed(2) display rounding boundary only — so a 5km race finishes
// at ~4.995km (displays 5.00), not 20m early at 4.98km. Keep aligned with the client constant.
export const MATCH_GOAL_DISTANCE_TOLERANCE_KM = 0.005;
export const MATCH_PROGRESS_MAX_SPEED_MPS = 12;
export const MATCH_PROGRESS_MAX_SPEED_KM_PER_SECOND = MATCH_PROGRESS_MAX_SPEED_MPS / 1000;
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
