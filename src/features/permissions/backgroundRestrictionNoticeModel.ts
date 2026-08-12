// 삼성 "백그라운드 사용 제한" 1회 안내의 순수 판정 (RN 무의존 — 노드 테스트가 카피 고정).
// 안드로이드에서 아직 안 본 경우에만 — iOS엔 이 설정 자체가 없고, 두 번 이상은 잔소리다.
export function shouldShowBackgroundRestrictionNotice({
  isAndroid,
  seen,
}: {
  isAndroid: boolean;
  seen: boolean;
}): boolean {
  return isAndroid && !seen;
}
