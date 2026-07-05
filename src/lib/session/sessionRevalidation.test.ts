import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '@/services/apiError';
import { isSessionInvalidatingError } from '@/lib/session/sessionRevalidation';

// The cold-start revalidation must only clear the session on a genuine 401. Anything
// transient (network / timeout / 5xx / offline) keeps the persisted session so a
// cold start without connectivity never silently signs the user out.

test('a 401 auth error invalidates the session', () => {
  const error = new ApiError('auth', 'unauthorized', { status: 401 });
  assert.equal(isSessionInvalidatingError(error), true);
});

test('a network failure does NOT invalidate the session', () => {
  const error = new ApiError('network', 'offline');
  assert.equal(isSessionInvalidatingError(error), false);
});

test('a timeout does NOT invalidate the session', () => {
  const error = new ApiError('timeout', 'slow');
  assert.equal(isSessionInvalidatingError(error), false);
});

test('a 5xx server error does NOT invalidate the session', () => {
  const error = new ApiError('server', 'boom', { status: 503 });
  assert.equal(isSessionInvalidatingError(error), false);
});

test('a 403 (auth kind, but not a dead token) does NOT invalidate the session', () => {
  const error = new ApiError('auth', 'forbidden', { status: 403 });
  assert.equal(isSessionInvalidatingError(error), false);
});

test('an auth-kind error with no HTTP status falls back to the kind and invalidates', () => {
  const error = new ApiError('auth', 'unauthorized');
  assert.equal(isSessionInvalidatingError(error), true);
});

test('a non-ApiError (plain Error / unknown) does NOT invalidate the session', () => {
  assert.equal(isSessionInvalidatingError(new Error('boom')), false);
  assert.equal(isSessionInvalidatingError(undefined), false);
  assert.equal(isSessionInvalidatingError('nope'), false);
});
