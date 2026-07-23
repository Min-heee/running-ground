// Full region display label — "전남광주통합특별시 동구", "경기도 수원시". A bare
// districtName is ambiguous (동구 exists in multiple metros), so user-facing
// profile surfaces join the whole hierarchy. Consecutive duplicates collapse
// because a 도 city without 구 stores districtName === cityName (수원시/수원시).

import { normalizeRegionName } from '@/utils/legacyRegionNames';

export type RegionLabelSource = {
  provinceName?: string;
  cityName?: string;
  districtName?: string;
};

export function formatRegionLabel(source: RegionLabelSource | null | undefined): string {
  if (!source) {
    return '';
  }

  // 시·도만 통합 전 이름을 정규화 — 서버 마이그레이션 전에 캐시/응답으로 남은
  // "광주광역시"도 현행 명칭으로 표시한다. 시·군·구 명칭은 통합 후에도 그대로다.
  const parts = [normalizeRegionName(source.provinceName), source.cityName, source.districtName]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part) => part.length > 0);

  const deduped = parts.filter((part, index) => index === 0 || part !== parts[index - 1]);
  return deduped.join(' ');
}
