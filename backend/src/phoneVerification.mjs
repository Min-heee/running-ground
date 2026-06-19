import { createHash, randomInt } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const PHONE_VERIFICATION_PURPOSES = new Set(['signup']);

export function isPhoneVerificationPurpose(value) {
  return PHONE_VERIFICATION_PURPOSES.has(value);
}

export function normalizePhoneNumber(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, 11);
}

export function isValidKoreanMobilePhoneNumber(phone) {
  return /^01\d{8,9}$/.test(normalizePhoneNumber(phone));
}

export function maskPhoneNumber(phone) {
  const digits = normalizePhoneNumber(phone);

  if (digits.length < 10) {
    return digits;
  }

  return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
}

export function generatePhoneVerificationCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashPhoneVerificationCode(requestId, code) {
  return createHash('sha256').update(`${requestId}:${String(code ?? '').trim()}`).digest('hex');
}

function buildSmsText(code) {
  return `[Web발신] RunningGround 인증번호는 ${code} 입니다. 5분 안에 입력해주세요.`;
}

export function createPhoneVerificationService({
  provider,
  appEnv,
  exposeTestCode,
  solapiApiKey,
  solapiApiSecret,
  solapiSender,
}) {
  let solapiMessageService = null;

  async function sendWithSolapi({ phone, code }) {
    if (!solapiApiKey || !solapiApiSecret || !solapiSender) {
      throw new Error('SOLAPI 설정이 비어 있어요. API 키, 시크릿, 발신번호를 확인해주세요.');
    }

    if (!solapiMessageService) {
      const { SolapiMessageService } = require('solapi');
      solapiMessageService = new SolapiMessageService(solapiApiKey, solapiApiSecret);
    }

    // solapi v6 merged sendOne/sendMany into send(); send() accepts a single
    // message object and is the only single-send method on the v6 instance.
    await solapiMessageService.send({
      to: phone,
      from: solapiSender,
      text: buildSmsText(code),
      autoTypeDetect: false,
    });

    return {
      provider: 'solapi',
    };
  }

  return {
    provider,
    async sendCode({ phone, code }) {
      if (provider === 'mock') {
        return {
          provider: 'mock',
          ...(exposeTestCode ? { testCode: code } : {}),
          appEnv,
        };
      }

      if (provider === 'solapi') {
        return sendWithSolapi({ phone, code });
      }

      throw new Error(`지원하지 않는 휴대폰 인증 공급자예요: ${provider}`);
    },
  };
}
