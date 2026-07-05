// Pure decision for cold-start session revalidation (P1-8). Kept free of any
// react-native / apiClient side-effect import so it is unit-testable in the node
// runner (ApiError itself has no runtime dependencies).
//
// On launch we surface the persisted profile snapshot immediately, then revalidate
// the token in the background. The ONLY error that may invalidate the session is a
// genuine auth failure (HTTP 401). A transient network failure / server 5xx /
// offline must NOT log the user out — otherwise every cold start without
// connectivity silently signs the user out.
import { ApiError } from '@/services/apiError';

// True only when the revalidation error means the token is no longer valid (401).
// Everything else — network, timeout, 5xx, offline, unknown — returns false so the
// existing session is kept.
export function isSessionInvalidatingError(error: unknown): boolean {
  if (error instanceof ApiError) {
    // Prefer the concrete HTTP status; fall back to the classified kind ('auth' is
    // set for 401/403). We only treat 401 as session-invalidating — a 403 is an
    // authorization problem on a specific resource, not a dead session token.
    if (typeof error.status === 'number') {
      return error.status === 401;
    }
    return error.kind === 'auth';
  }

  return false;
}
