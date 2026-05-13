import { useEffect, useMemo, useState } from 'react';
import { fetchMyProfile, fetchUniversityCatalog } from '@/services';
import type { MyProfileResponse } from '@/lib/api/types';
import {
  filterUniversitySuggestions,
  VERIFICATION_METHODS,
  type VerificationMethodId,
} from '@/features/auth/utils/universityVerification';

export function useUniversityVerification() {
  const [profile, setProfile] = useState<MyProfileResponse | null>(null);
  const [universities, setUniversities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMethodId, setSelectedMethodId] = useState<VerificationMethodId>('certificate');
  const [universityQuery, setUniversityQuery] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [certificatePrepared, setCertificatePrepared] = useState(false);
  const [identityChecked, setIdentityChecked] = useState(false);
  const [draftCreated, setDraftCreated] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchMyProfile(), fetchUniversityCatalog()])
      .then(([nextProfile, universityCatalog]) => {
        setProfile(nextProfile);
        setUniversities(universityCatalog.universities);
        setUniversityQuery(nextProfile.universityName ?? '');
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : '대학교 인증 정보를 불러오지 못했어요.');
      })
      .finally(() => setLoading(false));
  }, []);

  const selectedMethod = useMemo(
    () => VERIFICATION_METHODS.find((method) => method.id === selectedMethodId) ?? VERIFICATION_METHODS[0],
    [selectedMethodId],
  );
  const filteredUniversities = useMemo(
    () => filterUniversitySuggestions(universities, universityQuery),
    [universities, universityQuery],
  );
  const readinessCount = [
    identityChecked,
    selectedMethodId === 'certificate' ? certificatePrepared : Boolean(studentEmail.trim()),
  ].filter(Boolean).length;

  const resetDraft = () => {
    setDraftCreated(false);
    setDraftError(null);
  };

  const handleSelectMethod = (methodId: VerificationMethodId) => {
    setSelectedMethodId(methodId);
    resetDraft();
  };

  const handleUniversityQueryChange = (nextValue: string) => {
    setUniversityQuery(nextValue);
    resetDraft();
  };

  const handleStudentEmailChange = (nextValue: string) => {
    setStudentEmail(nextValue);
    resetDraft();
  };

  const toggleIdentityChecked = () => {
    setIdentityChecked((current) => !current);
    resetDraft();
  };

  const toggleCertificatePrepared = () => {
    setCertificatePrepared((current) => !current);
    resetDraft();
  };

  const handleCreateDraft = () => {
    setDraftError(null);

    if (!universityQuery.trim()) {
      setDraftCreated(false);
      setDraftError('학교명을 먼저 적어주세요.');
      return;
    }

    if (!identityChecked) {
      setDraftCreated(false);
      setDraftError('인증 전 확인 사항을 체크해주세요.');
      return;
    }

    if (selectedMethodId === 'certificate' && !certificatePrepared) {
      setDraftCreated(false);
      setDraftError('재학증명서 준비 여부를 체크해주세요.');
      return;
    }

    if (selectedMethodId === 'everytime' && !studentEmail.trim()) {
      setDraftCreated(false);
      setDraftError('학교 이메일을 입력해주세요.');
      return;
    }

    setDraftCreated(true);
  };

  return {
    certificatePrepared,
    draftCreated,
    draftError,
    error,
    filteredUniversities,
    handleCreateDraft,
    handleSelectMethod,
    handleStudentEmailChange,
    handleUniversityQueryChange,
    identityChecked,
    loading,
    profile,
    readinessCount,
    selectedMethod,
    selectedMethodId,
    studentEmail,
    toggleCertificatePrepared,
    toggleIdentityChecked,
    universityQuery,
  };
}
