// 소셜 로그인(카카오/애플 등)은 회원가입 폼을 건너뛰어 지역이 빈 값으로 생성된다.
// 지역은 지역 랭킹·홈 지역 배틀의 전제라 필수 — 비어 있으면 기본 정보 설정 화면으로
// 보낸다. 전화 가입은 지역이 가입 필수라 여기 걸릴 수 없다. 프로필이 아직 없으면
// (하이드레이션 전) 막지 않는다 — 다음 콜드 스타트에서 다시 판정된다.
export function needsProfileCompletion(
  profile: { provinceName?: string } | null | undefined,
): boolean {
  if (!profile) {
    return false;
  }

  return (profile.provinceName ?? '').trim().length === 0;
}
