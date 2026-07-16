import { createHash, randomInt } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// 'signup' gates registration; 'reset' gates password reset; 'find_username' gates 아이디 찾기.
// All three consume a verified, still-valid phone challenge for the exact number
// (see authRepository.register / resetPassword / findUsername).
const PHONE_VERIFICATION_PURPOSES = new Set(['signup', 'reset', 'find_username']);

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
    try {
      await solapiMessageService.send({
        to: phone,
        from: solapiSender,
        text: buildSmsText(code),
        // solapi v6 requires an explicit `type` when autoTypeDetect is false
        // (v5 silently defaulted to SMS → error 1010). Let it auto-detect; the
        // ~72-byte verification text resolves to SMS.
        autoTypeDetect: true,
      });
    } catch (error) {
      // v6 throws MessageNotReceivedError (with failedMessageList) when SOLAPI/the
      // carrier rejects the message — most commonly an unregistered sender number.
      // The top-level message is generic ("failedMessageList를 확인해주세요"), so dig
      // out the real per-message reason and surface it instead of a black box.
      const failed = error?.failedMessageList;
      if (Array.isArray(failed) && failed.length > 0) {
        const detail = failed
          .map((m) => [m?.statusMessage, m?.statusCode ? `(${m.statusCode})` : null].filter(Boolean).join(' '))
          .filter(Boolean)
          .join(' / ');
        console.error('[phoneVerification] SOLAPI send failed:', detail || error?.message, failed);
        throw new Error(
          `문자 발송에 실패했어요: ${detail || '알 수 없는 사유'}. 발신번호가 SOLAPI에 등록·승인됐는지 확인해주세요.`,
        );
      }
      console.error('[phoneVerification] SOLAPI send error:', error?.message ?? error);
      throw error;
    }

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
