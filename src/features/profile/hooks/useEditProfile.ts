import { useEffect, useState } from 'react';
import type { MyProfileResponse } from '@/lib/api/types';
import { fetchMyProfile, getApiErrorMessage, updateMyProfile } from '@/services';

export function useEditProfile() {
  const [profile, setProfile] = useState<MyProfileResponse | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMyProfile()
      .then((nextProfile) => {
        setProfile(nextProfile);
        setDisplayName(nextProfile.name);
      })
      .catch((loadError) => {
        setError(getApiErrorMessage(loadError, '프로필을 불러오지 못했어.'));
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!displayName.trim()) {
      setError('표시 이름은 비워둘 수 없어요.');
      return;
    }

    setError(null);
    setSaving(true);

    try {
      const nextProfile = await updateMyProfile({ name: displayName });
      setProfile(nextProfile);
      setDisplayName(nextProfile.name);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, '프로필 저장에 실패했어.'));
    } finally {
      setSaving(false);
    }
  };

  return {
    displayName,
    error,
    handleSave,
    loading,
    profile,
    saved,
    saving,
    setDisplayName,
  };
}
