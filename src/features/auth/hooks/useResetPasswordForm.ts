import { useState } from 'react';
import {
  getPasswordValidationError,
  normalizeUsername,
  requestResetPhoneVerification,
  resetPasswordByIdentity,
  verifyResetPhoneCode,
} from '@/lib/session';
import { getApiErrorMessage } from '@/services/apiError';
import { formatPhoneInput } from '@/features/auth/utils/signupFormatters';
import { usePhoneVerificationForm } from '@/features/auth/hooks/usePhoneVerificationForm';
import type { FoundUsernamePrefill } from '@/features/auth/hooks/useFindUsernameForm';

// 비밀번호 재설정 flow state for AccountRecoveryScreen. The backend requires a
// verified 'reset' phone token (P0-1), so this form embeds the shared
// phone-verification hook — the same state machine signup uses — wired to the
// reset-purpose service actions.

export function useResetPasswordForm() {
  const [resetUsername, setResetUsername] = useState('');
  const [resetName, setResetName] = useState('');
  const [resetPhone, setResetPhone] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  // Reset-password phone verification (P0-1): the backend requires a verified
  // 'reset' phone token, so the form must send an OTP-verified token before it can
  // change the password. Mirrors the signup phone-verify UX.
  const phoneVerification = usePhoneVerificationForm({
    phone: resetPhone,
    requestCode: requestResetPhoneVerification,
    verifyCode: verifyResetPhoneCode,
  });

  const passwordError = resetPassword ? getPasswordValidationError(resetPassword) : null;
  const passwordConfirmError = resetPasswordConfirm && resetPassword !== resetPasswordConfirm
    ? '비밀번호 확인이 일치하지 않아요.'
    : null;

  const handleResetUsernameChange = (nextValue: string) => {
    setResetUsername(nextValue.trim().toLowerCase());
  };

  const handleResetPhoneChange = (nextValue: string) => {
    const formattedPhone = formatPhoneInput(nextValue);
    setResetPhone((currentPhone) => {
      // Any change to the reset phone number invalidates a prior verification — the
      // token is bound to the number that was verified.
      if (formattedPhone !== currentPhone) {
        phoneVerification.resetVerification();
      }
      return formattedPhone;
    });
  };

  const prefillFromFoundIdentity = ({ username, realName, phone }: FoundUsernamePrefill) => {
    setResetUsername(username);
    setResetName(realName);
    // Prefilling the reset phone can change the number a prior OTP was bound to,
    // so drop any existing reset verification to force a fresh one.
    phoneVerification.resetVerification();
    setResetPhone(phone);
  };

  const handleResetPassword = async () => {
    setResetMessage(null);

    if (!phoneVerification.isVerified || !phoneVerification.verifiedToken) {
      setResetMessage('휴대폰 인증을 먼저 완료해주세요.');
      return;
    }

    if (passwordError) {
      setResetMessage(passwordError);
      return;
    }

    if (passwordConfirmError) {
      setResetMessage(passwordConfirmError);
      return;
    }

    setResetting(true);

    try {
      const result = await resetPasswordByIdentity({
        username: normalizeUsername(resetUsername),
        realName: resetName,
        phone: resetPhone,
        newPassword: resetPassword,
        phoneVerificationToken: phoneVerification.verifiedToken,
      });
      setResetMessage(result.message);
      setResetPassword('');
      setResetPasswordConfirm('');
    } catch (error) {
      setResetMessage(getApiErrorMessage(error, '비밀번호를 재설정하지 못했어요.'));
    } finally {
      setResetting(false);
    }
  };

  return {
    handleResetPassword,
    handleResetPhoneChange,
    handleResetUsernameChange,
    passwordConfirmError,
    passwordError,
    phoneVerification,
    prefillFromFoundIdentity,
    resetMessage,
    resetName,
    resetPassword,
    resetPasswordConfirm,
    resetPhone,
    resetUsername,
    resetting,
    setResetName,
    setResetPassword,
    setResetPasswordConfirm,
  };
}
