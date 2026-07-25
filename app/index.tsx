import { Redirect } from 'expo-router';
import { needsProfileCompletion } from '@/features/auth/utils/profileCompletion';
import { getCurrentUserProfile, getIsSignedIn } from '@/lib/session';

export default function Index() {
  if (!getIsSignedIn()) {
    return <Redirect href="/onboarding" />;
  }

  // 지역 미설정 소셜 계정(가입 폼을 건너뜀)은 홈 대신 기본 정보 설정으로 —
  // 지역 랭킹/지역 배틀이 지역을 전제하기 때문. 프로필 캐시가 아직 없으면
  // 막지 않고 홈으로 (다음 콜드 스타트에서 재판정).
  if (needsProfileCompletion(getCurrentUserProfile())) {
    return <Redirect href="/complete-profile?next=home" />;
  }

  return <Redirect href="/(tabs)/home" />;
}
