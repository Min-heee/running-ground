import { useEffect, useMemo, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import type { FriendLeaderboardResponse, MyProfileResponse } from '@/lib/api/types';
import { createFriendRequest, fetchFriendLeaderboard, fetchMyProfile, getApiErrorMessage } from '@/services';

export function useAddFriendScreen({ deepLinkTag }: { deepLinkTag?: string } = {}) {
  const [friendTag, setFriendTag] = useState('');
  const [copied, setCopied] = useState(false);
  const [added, setAdded] = useState(false);
  const [profile, setProfile] = useState<MyProfileResponse | null>(null);
  const [leaderboard, setLeaderboard] = useState<FriendLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchMyProfile(), fetchFriendLeaderboard()])
      .then(([profileData, leaderboardData]) => {
        setProfile(profileData);
        setLeaderboard(leaderboardData);
      })
      .catch((loadError) => {
        setError(getApiErrorMessage(loadError, '친구 추가 정보를 불러오지 못했어요.'));
      })
      .finally(() => setLoading(false));
  }, []);

  const handleCopy = async () => {
    if (!profile?.publicTag) {
      return;
    }

    try {
      // '복사됨'만 띄우고 실제로는 클립보드에 아무것도 안 넣던 버그 — 실제 복사 후에만 표시한다.
      await Clipboard.setStringAsync(profile.publicTag);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드를 쓸 수 없으면 라벨을 바꾸지 않는다.
    }
  };

  // 같은 프레임의 연타·딥링크 자동 신청과 탭이 겹쳐도 요청은 한 번만 — state(submitting)는
  // 다음 렌더 전까지 갱신되지 않으므로 ref로 막는다 (두 번째 요청은 409로 성공 직후 오류 표시).
  const submittingRef = useRef(false);

  const submitFriendTag = async (tagCode: string) => {
    if (submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setError(null);
    setSubmitting(true);

    try {
      // The input keeps only the code — the fixed '#' lives in the UI prefix, and the
      // server matches publicTag exactly ('#AB7K2'), so re-attach it here.
      await createFriendRequest(`#${tagCode}`);
      setAdded(true);
      setFriendTag('');
      setTimeout(() => setAdded(false), 2000);

      const refreshedLeaderboard = await fetchFriendLeaderboard();
      setLeaderboard(refreshedLeaderboard);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, '친구 요청 전송에 실패했어요.'));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  // 공유 링크 딥링크로 태그가 실려 오면: 입력을 채우고 1회 자동으로 친구 신청까지 보낸다
  // ("링크만 누르면 알아서 신청"). 자기 태그·중복 신청 등은 서버 검증 메시지가 그대로 뜬다.
  const autoSubmittedDeepLinkRef = useRef(false);

  useEffect(() => {
    if (loading || !profile || autoSubmittedDeepLinkRef.current) {
      return;
    }

    const deepLinkCode = String(deepLinkTag ?? '').replace(/^#/, '').trim().toUpperCase();

    if (!/^[A-Z0-9]{3,8}$/.test(deepLinkCode)) {
      return;
    }

    autoSubmittedDeepLinkRef.current = true;
    setFriendTag(deepLinkCode);
    void submitFriendTag(deepLinkCode);
  }, [deepLinkTag, loading, profile]);

  const handleAddFriend = async () => {
    const tagCode = friendTag.trim();
    if (!tagCode) {
      setError('친구 태그를 입력해주세요.');
      return;
    }

    await submitFriendTag(tagCode);
  };

  const requestCounts = useMemo(() => ({
    pendingCount: leaderboard?.requests.filter((request) => request.status === 'pending').length ?? 0,
    receivedCount: leaderboard?.requests.filter((request) => request.status === 'received').length ?? 0,
  }), [leaderboard?.requests]);

  // '#' is rendered as a fixed prefix in the input UI — strip any typed/pasted '#'
  // so pasting a full tag ('#AB7K2') still works and submit never doubles it.
  const handleFriendTagChange = (value: string) => setFriendTag(value.replace(/#/g, '').toUpperCase());

  return {
    added,
    copied,
    error,
    friendTag,
    handleAddFriend,
    handleCopy,
    handleFriendTagChange,
    loading,
    profile,
    requestCounts,
    submitting,
  };
}
