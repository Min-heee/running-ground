import assert from 'node:assert/strict';
import { routeAuthPhoneVerificationRequest } from './authPhoneVerificationRoutes.mjs';
import { hashPhoneVerificationCode } from '../phoneVerification.mjs';
import {
  cleanupPhoneVerificationChallenges,
  ensurePhoneVerificationChallenges,
} from '../lib/phoneVerificationStoreHelpers.mjs';
import { ApiError } from '../response/httpResponse.mjs';

async function runTest(name, testFn) {
  try {
    await testFn();
    console.log(`[authPhoneVerificationRoutes] ok - ${name}`);
  } catch (error) {
    console.error(`[authPhoneVerificationRoutes] failed - ${name}`);
    throw error;
  }
}

// Mirrors both real store drivers: the mutator works on a copy that is committed only when it
// returns normally — a throw discards every change (JSON throws before saveStore, Postgres rolls back).
function createTransactionalStore(initialStore) {
  let committed = structuredClone(initialStore);
  return {
    read: () => structuredClone(committed),
    mutateStore: async (mutator) => {
      const draft = structuredClone(committed);
      const result = mutator(draft);
      committed = draft;
      return result;
    },
  };
}

function buildChallenge(now) {
  return {
    id: 'challenge-1',
    purpose: 'signup',
    phone: '01012345678',
    codeHash: hashPhoneVerificationCode('challenge-1', '123456'),
    attempts: 0,
    maxAttempts: 5,
    status: 'pending',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
    resendAvailableAt: now.toISOString(),
  };
}

async function verifyCode(store, code) {
  const sent = [];
  await routeAuthPhoneVerificationRequest({
    method: 'POST',
    pathname: '/api/auth/phone/verify-code',
    request: {},
    response: {},
    sendJson: (_response, status, payload) => sent.push({ status, payload }),
    mutateStore: store.mutateStore,
    parseJsonBody: async () => ({ requestId: 'challenge-1', purpose: 'signup', code }),
    cleanupPhoneVerificationChallenges,
    ensurePhoneVerificationChallenges,
    hashPhoneVerificationCode,
    createToken: () => 'verified-token',
    buildPhoneVerificationSuccessPayload: (challenge) => ({ verifiedToken: challenge.verifiedToken }),
    validatePhoneVerificationCode: (value) => value,
    validatePhoneVerificationPurpose: (value) => value,
    validateRequiredString: (value) => value,
    PHONE_VERIFICATION_VERIFIED_TTL_MS: 10 * 60 * 1000,
    ApiError,
  });
  return sent;
}

await runTest('wrong codes are counted and the challenge locks after maxAttempts', async () => {
  const store = createTransactionalStore({ phoneVerificationChallenges: [buildChallenge(new Date())] });

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await assert.rejects(verifyCode(store, '000000'), (error) => error.statusCode === 400);
    assert.equal(store.read().phoneVerificationChallenges[0].attempts, attempt);
  }

  await assert.rejects(verifyCode(store, '000000'), (error) => error.statusCode === 429);
  const locked = store.read().phoneVerificationChallenges[0];
  assert.equal(locked.attempts, 5);
  assert.equal(locked.status, 'locked');

  // Even the correct code is refused once the challenge is locked.
  await assert.rejects(verifyCode(store, '123456'), (error) => error.statusCode === 400);
  assert.equal(store.read().phoneVerificationChallenges[0].status, 'locked');
});

await runTest('the correct code still verifies after a few wrong guesses', async () => {
  const store = createTransactionalStore({ phoneVerificationChallenges: [buildChallenge(new Date())] });

  await assert.rejects(verifyCode(store, '000000'), (error) => error.statusCode === 400);
  const sent = await verifyCode(store, '123456');

  assert.deepEqual(sent, [{ status: 200, payload: { verifiedToken: 'verified-token' } }]);
  const verified = store.read().phoneVerificationChallenges[0];
  assert.equal(verified.status, 'verified');
  assert.equal(verified.attempts, 1);
});

console.log('[authPhoneVerificationRoutes] all tests passed');
