import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiErrorMessage } from '@/services/apiError';

// Shared phone-OTP form state machine for signup AND password recovery (P0-1 launch
// flow). The two callers differ only in which purpose-tagged service they hit
// (signup vs reset — the 'purpose' field lives inside the injected service call),
// so the request/verify/cooldown/reset transitions are consolidated here once.
// Behavior is a verbatim merge of the previously duplicated clusters in
// useSignupForm and AccountRecoveryScreen.

type UsePhoneVerificationFormParams = {
  /** The phone number the OTP will be bound to (formatted input; digits are extracted for validity). */
  phone: string;
  /** Purpose-specific request-code service (e.g. requestSignupPhoneVerification / requestResetPhoneVerification). */
  requestCode: (phone: string) => Promise<{ requestId: string; resendAvailableAt?: string }>;
  /** Purpose-specific verify-code service (e.g. verifySignupPhoneCode / verifyResetPhoneCode). */
  verifyCode: (requestId: string, code: string) => Promise<{ verifiedToken: string }>;
  /** Error copy when requesting a code fails (both callers currently share the default). */
  requestErrorFallback?: string;
  /** Error copy when verifying a code fails (both callers currently share the default). */
  verifyErrorFallback?: string;
};

export function usePhoneVerificationForm({
  phone,
  requestCode,
  verifyCode,
  requestErrorFallback = '인증번호 발송에 실패했어요.',
  verifyErrorFallback = '인증번호 확인에 실패했어요.',
}: UsePhoneVerificationFormParams) {
  const [requestId, setRequestId] = useState('');
  const [code, setCode] = useState('');
  const [verifiedToken, setVerifiedToken] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [isRequestingCode, setIsRequestingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const phoneValid = phone.replace(/\D/g, '').length >= 10;

  useEffect(() => () => {
    if (cooldownTimerRef.current) {
      clearInterval(cooldownTimerRef.current);
    }
  }, []);

  const startResendCooldown = useCallback((resendAvailableAt?: string) => {
    if (cooldownTimerRef.current) {
      clearInterval(cooldownTimerRef.current);
    }

    const parsedResendMs = resendAvailableAt ? new Date(resendAvailableAt).getTime() : Number.NaN;
    const initialSeconds = Number.isFinite(parsedResendMs)
      ? Math.max(0, Math.ceil((parsedResendMs - Date.now()) / 1000))
      : 60;

    setResendCooldown(initialSeconds);

    if (initialSeconds <= 0) {
      return;
    }

    cooldownTimerRef.current = setInterval(() => {
      setResendCooldown((current) => {
        if (current <= 1) {
          if (cooldownTimerRef.current) {
            clearInterval(cooldownTimerRef.current);
            cooldownTimerRef.current = null;
          }
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  }, []);

  // Any change to the phone number invalidates a prior verification — the token
  // is bound to the number that was verified. Callers invoke this from their
  // phone-change handlers (and recovery's find-username prefill).
  const resetVerification = useCallback(() => {
    if (cooldownTimerRef.current) {
      clearInterval(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
    setRequestId('');
    setCode('');
    setVerifiedToken('');
    setIsVerified(false);
    setError(null);
    setResendCooldown(0);
  }, []);

  const handleRequestCode = async () => {
    if (!phoneValid || isRequestingCode || resendCooldown > 0) {
      return;
    }

    setError(null);
    setIsRequestingCode(true);

    try {
      const result = await requestCode(phone);
      setRequestId(result.requestId);
      setCode('');
      setIsVerified(false);
      setVerifiedToken('');
      startResendCooldown(result.resendAvailableAt);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, requestErrorFallback));
    } finally {
      setIsRequestingCode(false);
    }
  };

  const handleCodeChange = (nextValue: string) => {
    setCode(nextValue.replace(/\D/g, '').slice(0, 6));
    setError(null);
  };

  const handleVerifyCode = async () => {
    if (!requestId || code.length !== 6 || isVerifyingCode) {
      return;
    }

    setError(null);
    setIsVerifyingCode(true);

    try {
      const result = await verifyCode(requestId, code);
      setVerifiedToken(result.verifiedToken);
      setIsVerified(true);

      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
      setResendCooldown(0);
    } catch (verifyError) {
      setError(getApiErrorMessage(verifyError, verifyErrorFallback));
    } finally {
      setIsVerifyingCode(false);
    }
  };

  return {
    code,
    error,
    handleCodeChange,
    handleRequestCode,
    handleVerifyCode,
    isRequestingCode,
    isVerified,
    isVerifyingCode,
    phoneValid,
    requestId,
    resendCooldown,
    resetVerification,
    verifiedToken,
  };
}
