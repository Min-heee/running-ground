// Full region display label — "광주광역시 동구", "경기도 수원시". A bare
// districtName is ambiguous (동구 exists in six metros), so user-facing profile
// surfaces join the whole hierarchy. Consecutive duplicates collapse because a
// 도 city without 구 stores districtName === cityName (수원시/수원시).

export type RegionLabelSource = {
  provinceName?: string;
  cityName?: string;
  districtName?: string;
};

export function formatRegionLabel(source: RegionLabelSource | null | undefined): string {
  if (!source) {
    return '';
  }

  const parts = [source.provinceName, source.cityName, source.districtName]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part) => part.length > 0);

  const deduped = parts.filter((part, index) => index === 0 || part !== parts[index - 1]);
  return deduped.join(' ');
}
