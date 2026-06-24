export const RECOMMENDED_MATCH_DISTANCES = [3, 5, 7, 10, 15, 21.1, 42.195];
export const DUEL_MIN_COMPATIBILITY_SCORE = 72;
export const GROUP_MIN_COMPATIBILITY_SCORE = 68;
// Authoritative duel pairing gate: two runners pair whenever their average paces
// are within ±15 seconds/km. Matching is pace-only — level no longer gates.
export const DUEL_PACE_MATCH_TOLERANCE_SECONDS = 15;
// Authoritative group pairing gate: a group of 3 forms from the tightest cluster of
// paces all within ±15 seconds/km of each other; later joiners must be within ±15s
// of the group anchor (the average pace of the founding 3). Pace-only — the legacy
// GROUP_MIN_COMPATIBILITY_SCORE no longer gates pairing (it survives only as a
// demand-summary label).
export const GROUP_PACE_MATCH_TOLERANCE_SECONDS = 15;
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
export const MATCH_ROOM_HOST_LOADING_SECONDS = 2;
// Safety ceiling for host-start loading if a participant never acknowledges countdown readiness.
export const MATCH_ROOM_HOST_MAX_LOADING_WAIT_SECONDS = 8;
// A group party-run room (그룹대결) must seat more than two runners — otherwise it
// is just a duel. This is the floor for both the start gate and the room capacity.
export const MATCH_ROOM_GROUP_MIN_PARTICIPANTS = 3;
export const MATCH_ROOM_GROUP_DEFAULT_PARTICIPANTS = 10;
export const MATCH_ROOM_GROUP_MAX_PARTICIPANTS = 30;
export const MATCH_ROOM_IDLE_TTL_MS = 24 * 60 * 60 * 1000;
export const MATCH_ROOM_INVITE_LINK_BASE = 'runningground://running';
// 20m: warmup baseline subtraction + toFixed(2) display rounding boundary margin.
export const MATCH_GOAL_DISTANCE_TOLERANCE_KM = 0.02;
export const MATCH_PROGRESS_MAX_SPEED_MPS = 12;
export const MATCH_PROGRESS_MAX_SPEED_KM_PER_SECOND = MATCH_PROGRESS_MAX_SPEED_MPS / 1000;
// Once one duel runner finishes, the other has a bounded window to land their own
// finish before the server resolves the duel server-side (missing runner = DNF) so
// neither client is stranded on a 'pending' verdict forever. Sized to the running
// stale window so a runner who genuinely stopped reporting is treated as a DNF.
export const MATCH_DUEL_FINISH_FALLBACK_MS = MATCH_PARTICIPANT_RUNNING_STALE_MS;
