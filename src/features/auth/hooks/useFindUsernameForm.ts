import { useState } from 'react';
import {
  findUsernameByIdentity,
  requestFindUsernamePhoneVerification,
  verifyFindUsernamePhoneCode,
} from '@/lib/session';
import { getApiErrorMessage } from '@/services/apiError';
import { formatPhoneInput } from '@/features/auth/utils/signupFormatters';
import { usePhoneVerificationForm } from '@/features/auth/hooks/usePhoneVerificationForm';

// 아이디 찾기 flow state for AccountRecoveryScreen. Apple 5.1.1(v): identity is now
// realName + phone + a verified 'find_username' phone OTP (no 생년월일). On success the
// found identity is handed to the reset-password form (via onFound) so the 비밀번호
// 재설정 card comes prefilled with the same identity fields.

export type FoundUsernamePrefill = {
  username: string;
  realName: string;
  phone: string;
};

export function useFindUsernameForm({ onFound }: { onFound: (prefill: FoundUsernamePrefill) => void }) {
  const [findName, setFindName] = useState('');
  const [findPhone, setFindPhone] = useState('');
  const [foundUsername, setFoundUsername] = useState<string | null>(null);
  const [findMessage, setFindMessage] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);

  // Find-username phone verification: the backend requires a verified 'find_username'
  // OTP token, so the form embeds the shared phone-verify hook wired to the
  // find-username-purpose service actions.
  const phoneVerification = usePhoneVerificationForm({
    phone: findPhone,
    requestCode: requestFindUsernamePhoneVerification,
    verifyCode: verifyFindUsernamePhoneCode,
  });

  const handleFindPhoneChange = (nextValue: string) => {
    const formattedPhone = formatPhoneInput(nextValue);
    setFindPhone((currentPhone) => {
      // Any change to the phone number invalidates a prior verification — the token is
      // bound to the number that was verified.
      if (formattedPhone !== currentPhone) {
        phoneVerification.resetVerification();
      }
      return formattedPhone;
    });
  };

  const handleFindUsername = async () => {
    setFindMessage(null);
    setFoundUsername(null);

    if (!phoneVerification.isVerified || !phoneVerification.verifiedToken) {
      setFindMessage('휴대폰 인증을 먼저 완료해주세요.');
      return;
    }

    setFinding(true);

    try {
      const result = await findUsernameByIdentity({
        realName: findName,
        phone: findPhone,
        phoneVerificationToken: phoneVerification.verifiedToken,
      });
      setFoundUsername(result.username);
      setFindMessage(`${result.maskedPhone} 정보로 가입된 아이디를 찾았어요.`);
      onFound({
        username: result.username,
        realName: findName.trim(),
        phone: findPhone,
      });
    } catch (error) {
      setFindMessage(getApiErrorMessage(error, '아이디를 찾지 못했어요.'));
    } finally {
      setFinding(false);
    }
  };

  return {
    findMessage,
    findName,
    findPhone,
    finding,
    foundUsername,
    handleFindPhoneChange,
    handleFindUsername,
    phoneVerification,
    setFindName,
  };
}
