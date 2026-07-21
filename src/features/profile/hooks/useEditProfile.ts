import { useEffect, useState } from 'react';
import type { MyProfileResponse } from '@/lib/api/types';
import { fetchMyProfile, getApiErrorMessage, updateMyProfile } from '@/services';

export const PUBLIC_TAG_CODE_MAX_LENGTH = 8;
export const PUBLIC_TAG_CODE_MIN_LENGTH = 3;
export const STATUS_MESSAGE_MAX_LENGTH = 40;

// Mirrors the server rule (meProfileRoutes): uppercase alphanumerics only.
const PUBLIC_TAG_CODE_PATTERN = /^[A-Z0-9]{3,8}$/;

function extractTagCode(publicTag: string | undefined) {
  return (publicTag ?? '').replace(/^#/, '');
}

export function useEditProfile() {
  const [profile, setProfile] = useState<MyProfileResponse | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [tagCode, setTagCode] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMyProfile()
      .then((nextProfile) => {
        setProfile(nextProfile);
        setDisplayName(nextProfile.name);
        setTagCode(extractTagCode(nextProfile.publicTag));
        setStatusMessage(nextProfile.statusMessage ?? '');
      })
      .catch((loadError) => {
        setError(getApiErrorMessage(loadError, '프로필을 불러오지 못했어요.'));
      })
      .finally(() => setLoading(false));
  }, []);

  // The '#' lives in the UI as a fixed prefix — strip any typed/pasted '#' and
  // keep the code uppercase so what the user sees is exactly what is saved.
  const handleTagCodeChange = (value: string) => {
    setTagCode(value.replace(/#/g, '').toUpperCase().slice(0, PUBLIC_TAG_CODE_MAX_LENGTH));
  };

  const handleSave = async () => {
    if (!displayName.trim()) {
      setError('표시 이름은 비워둘 수 없어요.');
      return;
    }

    const trimmedTagCode = tagCode.trim();
    if (!PUBLIC_TAG_CODE_PATTERN.test(trimmedTagCode)) {
      setError(`태그는 영문/숫자 ${PUBLIC_TAG_CODE_MIN_LENGTH}~${PUBLIC_TAG_CODE_MAX_LENGTH}자로 입력해주세요.`);
      return;
    }

    setError(null);
    setSaving(true);

    try {
      const nextProfile = await updateMyProfile({
        name: displayName,
        publicTag: trimmedTagCode,
        statusMessage: statusMessage.trim(),
      });
      setProfile(nextProfile);
      setDisplayName(nextProfile.name);
      setTagCode(extractTagCode(nextProfile.publicTag));
      setStatusMessage(nextProfile.statusMessage ?? '');
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, '프로필 저장에 실패했어요.'));
    } finally {
      setSaving(false);
    }
  };

  return {
    displayName,
    error,
    handleSave,
    handleTagCodeChange,
    loading,
    profile,
    saved,
    saving,
    setDisplayName,
    setStatusMessage,
    statusMessage,
    tagCode,
  };
}
