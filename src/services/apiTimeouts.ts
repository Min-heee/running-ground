// Per-request abort-timeout constants, kept in an RN-free module so they can be
// unit-tested (importing apiClient pulls in react-native). Re-exported from
// apiClient so existing import sites are unchanged.

// Default per-request abort timeout when a call doesn't override it.
export const DEFAULT_API_TIMEOUT_MS = 10000;

// Tight timeout for high-frequency, retried live-match requests. Well above a healthy
// backend's sub-second latency, far below the default so a network/backend stall can't
// freeze live progress for ~10s.
export const LIVE_MATCH_REQUEST_TIMEOUT_MS = 5000;

// Long timeout for the tracked-run save, which uploads the full GPS route as one large
// body. On the 1vCPU production droplet a big write can take much longer than the 10s
// default; aborting would trigger a retry that re-sends the whole payload (the backend
// dedup already tolerates a retry, but the extra round-trip is wasteful). 60s lets a
// slow write finish once. Scoped to this save only — every other request keeps the
// default.
export const TRACKED_RUN_SAVE_TIMEOUT_MS = 60000;
