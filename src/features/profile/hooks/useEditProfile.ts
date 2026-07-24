import { useEffect, useState } from 'react';
import type { MyProfileResponse } from '@/lib/api/types';
import { checkMyTagAvailability, fetchMyProfile, getApiErrorMessage, updateMyProfile } from '@/services';

export const PUBLIC_TAG_CODE_MAX_LENGTH = 8;
export const PUBLIC_TAG_CODE_MIN_LENGTH = 3;
export const STATUS_MESSAGE_MAX_LENGTH = 40;

// Mirrors the server rule (meProfileRoutes): uppercase alphanumerics only.
const PUBLIC_TAG_CODE_PATTERN = /^[A-Z0-9]{3,8}$/;

// 실시간 중복확인 상태. 'unknown' = 확인 실패(오프라인/구버전 백엔드) — 인디케이터를
// 숨기고 저장 시 409에 맡긴다. 저장 차단은 'taken'일 때만 (확인 불가 상태로 저장을
// 막으면 백엔드 배포 전에 태그 수정 자체가 불가능해진다).
export type TagAvailabilityStatus = 'idle' | 'checking' | 'own' | 'free' | 'taken' | 'invalid' | 'unknown';
export type TagAvailabilityView = { status: TagAvailabilityStatus; message: string };

const TAG_CHECK_DEBOUNCE_MS = 400;
const IDLE_TAG_AVAILABILITY: TagAvailabilityView = { status: 'idle', message: '' };

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
  const [tagAvailability, setTagAvailability] = useState<TagAvailabilityView>(IDLE_TAG_AVAILABILITY);

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

  // 태그 실시간 중복확인 — 디바운스 후 서버에 물어본다. 내 현재 태그/형식 오류는
  // 로컬에서 즉답, 서버 확인 실패는 'unknown'으로 강등 (저장 시 409가 최종 권위).
  useEffect(() => {
    if (loading || !profile) {
      return;
    }

    const code = tagCode.trim();

    if (code.length === 0) {
      setTagAvailability(IDLE_TAG_AVAILABILITY);
      return;
    }

    if (code === extractTagCode(profile.publicTag)) {
      setTagAvailability({ status: 'own', message: '지금 쓰고 있는 태그예요.' });
      return;
    }

    if (!PUBLIC_TAG_CODE_PATTERN.test(code)) {
      setTagAvailability({
        status: 'invalid',
        message: `태그는 영문/숫자 ${PUBLIC_TAG_CODE_MIN_LENGTH}~${PUBLIC_TAG_CODE_MAX_LENGTH}자로 입력해주세요.`,
      });
      return;
    }

    let cancelled = false;
    setTagAvailability({ status: 'checking', message: '중복 확인 중...' });

    const timer = setTimeout(() => {
      checkMyTagAvailability(code)
        .then((result) => {
          if (!cancelled) {
            setTagAvailability({
              status: result.available ? (result.reason === 'own' ? 'own' : 'free') : 'taken',
              message: result.message,
            });
          }
        })
        .catch(() => {
          if (!cancelled) {
            setTagAvailability({ status: 'unknown', message: '' });
          }
        });
    }, TAG_CHECK_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [loading, profile, tagCode]);

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

    if (tagAvailability.status === 'taken') {
      setError('이미 사용 중인 태그예요. 다른 태그를 입력해주세요.');
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
    tagAvailability,
    tagCode,
  };
}
