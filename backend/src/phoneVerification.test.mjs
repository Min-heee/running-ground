import assert from 'node:assert/strict';
import {
  createPhoneVerificationService,
  generatePhoneVerificationCode,
  hashPhoneVerificationCode,
  isPhoneVerificationPurpose,
  isValidKoreanMobilePhoneNumber,
  maskPhoneNumber,
  normalizePhoneNumber,
} from './phoneVerification.mjs';

async function runTest(name, testFn) {
  try {
    await testFn();
    console.log(`[phoneVerification] ok - ${name}`);
  } catch (error) {
    console.error(`[phoneVerification] failed - ${name}`);
    throw error;
  }
}

await runTest('normalizes and validates Korean mobile numbers', () => {
  assert.equal(normalizePhoneNumber('010-1234-5678'), '01012345678');
  assert.equal(isValidKoreanMobilePhoneNumber('01012345678'), true);
  assert.equal(isValidKoreanMobilePhoneNumber('0212345678'), false);
  assert.equal(maskPhoneNumber('01012345678'), '010-****-5678');
});

await runTest('supports signup, reset, and find_username phone verification purposes', () => {
  assert.equal(isPhoneVerificationPurpose('signup'), true);
  assert.equal(isPhoneVerificationPurpose('reset'), true);
  assert.equal(isPhoneVerificationPurpose('find_username'), true);
  assert.equal(isPhoneVerificationPurpose('login'), false);
});

await runTest('generates six digit codes and deterministic hashes', () => {
  const code = generatePhoneVerificationCode();
  assert.match(code, /^\d{6}$/);
  assert.equal(
    hashPhoneVerificationCode('request-1', '123456'),
    hashPhoneVerificationCode('request-1', '123456'),
  );
  assert.notEqual(
    hashPhoneVerificationCode('request-1', '123456'),
    hashPhoneVerificationCode('request-2', '123456'),
  );
});

await runTest('mock provider can expose a test code for local development', async () => {
  const service = createPhoneVerificationService({
    provider: 'mock',
    appEnv: 'development',
    exposeTestCode: true,
    solapiApiKey: '',
    solapiApiSecret: '',
    solapiSender: '',
  });

  const result = await service.sendCode({
    phone: '01012345678',
    code: '654321',
    purpose: 'signup',
  });

  assert.deepEqual(result, {
    provider: 'mock',
    testCode: '654321',
    appEnv: 'development',
  });
});

// ── App-Review 로그인 우회 (route-level, 최소 fake 주입) ─────────────────────────
// 심사관은 한국 SMS를 못 받으므로 지정 번호는 발송 없이 고정 OTP로 인증돼야 한다.
// 핵심 검증 2가지: (1) 심사 번호는 sendCode가 절대 호출되지 않고 200이 떨어진다,
// (2) 저장된 챌린지의 codeHash가 고정 OTP의 해시다(= verify-code가 그 OTP를 통과시킴 —
// verify는 같은 hashPhoneVerificationCode 비교를 쓴다).
const { routeAuthPhoneVerificationRequest } = await import('./routes/authPhoneVerificationRoutes.mjs');

function buildRouteFakes({ reviewLoginPhone, reviewLoginOtp, store }) {
  let sent = null;
  let jsonResponse = null;

  return {
    invoke: (bodyJson) => routeAuthPhoneVerificationRequest({
      method: 'POST',
      pathname: '/api/auth/phone/request-code',
      request: { headers: {}, socket: { remoteAddress: '127.0.0.1' } },
      response: {},
      sendJson: (_response, status, payload) => {
        jsonResponse = { status, payload };
      },
      mutateStore: async (mutator) => {
        mutator(store);
      },
      smsRequestCodeGuard: { check: () => ({ allowed: true }) },
      trustProxy: false,
      reviewLoginPhone,
      reviewLoginOtp,
      buildPhoneVerificationPayload: (challenge, providerResult) => ({
        requestId: challenge.id,
        provider: providerResult?.provider ?? null,
      }),
      buildPhoneVerificationSuccessPayload: () => ({}),
      cleanupPhoneVerificationChallenges: () => {},
      createPhoneVerificationChallenge: ({ purpose, phone }) => {
        const code = '111111';
        return {
          challenge: {
            id: 'phone-review-1',
            purpose,
            phone,
            codeHash: hashPhoneVerificationCode('phone-review-1', code),
            attempts: 0,
            maxAttempts: 5,
            status: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 300000).toISOString(),
            resendAvailableAt: new Date(Date.now() + 60000).toISOString(),
          },
          code,
        };
      },
      createToken: () => 'token',
      ensurePhoneVerificationChallenges: (targetStore) => {
        targetStore.phoneVerificationChallenges ??= [];
        return targetStore.phoneVerificationChallenges;
      },
      hashPhoneVerificationCode,
      phoneVerificationService: {
        sendCode: async (input) => {
          sent = input;
          return { provider: 'solapi' };
        },
      },
      validatePhoneNumber: (value) => normalizePhoneNumber(value),
      validatePhoneVerificationCode: (value) => value,
      validatePhoneVerificationPurpose: (value) => value,
      validateRequiredString: (value) => value,
      parseJsonBody: async () => bodyJson,
      PHONE_VERIFICATION_VERIFIED_TTL_MS: 600000,
      ApiError: class extends Error {
        constructor(status, message) {
          super(message);
          this.status = status;
        }
      },
    }),
    getSent: () => sent,
    getJson: () => jsonResponse,
  };
}

await runTest('review phone: no SMS is sent and the challenge verifies against the fixed OTP', async () => {
  const store = {};
  const fakes = buildRouteFakes({ reviewLoginPhone: '01099999999', reviewLoginOtp: '424242', store });

  await fakes.invoke({ purpose: 'signup', phone: '010-9999-9999' });

  assert.equal(fakes.getSent(), null);
  assert.equal(fakes.getJson().status, 200);
  assert.equal(fakes.getJson().payload.provider, 'review');
  assert.equal(
    store.phoneVerificationChallenges[0].codeHash,
    hashPhoneVerificationCode('phone-review-1', '424242'),
  );
});

await runTest('non-review phone keeps the normal SMS path even when the bypass is configured', async () => {
  const store = {};
  const fakes = buildRouteFakes({ reviewLoginPhone: '01099999999', reviewLoginOtp: '424242', store });

  await fakes.invoke({ purpose: 'signup', phone: '010-1234-5678' });

  assert.equal(fakes.getSent()?.phone, '01012345678');
  assert.equal(fakes.getJson().payload.provider, 'solapi');
  assert.equal(
    store.phoneVerificationChallenges[0].codeHash,
    hashPhoneVerificationCode('phone-review-1', '111111'),
  );
});

await runTest('bypass disabled (empty env) never diverts even the configured-looking number', async () => {
  const store = {};
  const fakes = buildRouteFakes({ reviewLoginPhone: '', reviewLoginOtp: '', store });

  await fakes.invoke({ purpose: 'signup', phone: '010-9999-9999' });

  assert.equal(fakes.getSent()?.phone, '01099999999');
  assert.equal(fakes.getJson().payload.provider, 'solapi');
});
