import { useState } from 'react';
import { findUsernameByIdentity } from '@/lib/session';
import { getApiErrorMessage } from '@/services/apiError';
import { formatBirthDateInput, formatPhoneInput } from '@/features/auth/utils/signupFormatters';

// 아이디 찾기 flow state for AccountRecoveryScreen. On success the found identity is
// handed to the reset-password form (via onFound) so the 비밀번호 재설정 card comes
// prefilled with the same identity fields.

export type FoundUsernamePrefill = {
  username: string;
  realName: string;
  phone: string;
  birthDate: string;
};

export function useFindUsernameForm({ onFound }: { onFound: (prefill: FoundUsernamePrefill) => void }) {
  const [findName, setFindName] = useState('');
  const [findPhone, setFindPhone] = useState('');
  const [findBirthDate, setFindBirthDate] = useState('');
  const [foundUsername, setFoundUsername] = useState<string | null>(null);
  const [findMessage, setFindMessage] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);

  const handleFindPhoneChange = (nextValue: string) => {
    setFindPhone(formatPhoneInput(nextValue));
  };

  const handleFindBirthDateChange = (nextValue: string) => {
    setFindBirthDate(formatBirthDateInput(nextValue));
  };

  const handleFindUsername = async () => {
    setFindMessage(null);
    setFoundUsername(null);
    setFinding(true);

    try {
      const result = await findUsernameByIdentity({
        realName: findName,
        phone: findPhone,
        birthDate: findBirthDate,
      });
      setFoundUsername(result.username);
      setFindMessage(`${result.maskedPhone} 정보로 가입된 아이디를 찾았어요.`);
      onFound({
        username: result.username,
        realName: findName.trim(),
        phone: findPhone,
        birthDate: findBirthDate,
      });
    } catch (error) {
      setFindMessage(getApiErrorMessage(error, '아이디를 찾지 못했어요.'));
    } finally {
      setFinding(false);
    }
  };

  return {
    findBirthDate,
    findMessage,
    findName,
    findPhone,
    finding,
    foundUsername,
    handleFindBirthDateChange,
    handleFindPhoneChange,
    handleFindUsername,
    setFindName,
  };
}
