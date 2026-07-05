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

await runTest('supports signup and reset phone verification purposes', () => {
  assert.equal(isPhoneVerificationPurpose('signup'), true);
  assert.equal(isPhoneVerificationPurpose('reset'), true);
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
