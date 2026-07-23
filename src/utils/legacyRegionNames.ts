// 2026-07-01 행정통합(광주광역시 + 전라남도 → 전남광주통합특별시) 이전 이름 정규화.
//
// OTA(클라이언트)와 백엔드 재배포 사이의 시차, 그리고 기기에 캐시된 세션 프로필 때문에
// "서버 트리 이름"과 "프로필 이름" 중 어느 한쪽만 옛 이름인 창이 존재한다. 이름을
// 비교하거나 표시하기 직전에 양쪽 다 이 함수를 통과시키면 옛/새 어떤 조합이어도
// 일관되게 동작한다. 시·군·구 명칭은 통합 후에도 그대로라 시·도 이름만 매핑한다.
const LEGACY_PROVINCE_NAME_MAP: Record<string, string> = {
  광주광역시: '전남광주통합특별시',
  전라남도: '전남광주통합특별시',
};

export function normalizeRegionName(name: string | null | undefined): string {
  if (typeof name !== 'string' || name.length === 0) {
    return '';
  }

  return LEGACY_PROVINCE_NAME_MAP[name] ?? name;
}
