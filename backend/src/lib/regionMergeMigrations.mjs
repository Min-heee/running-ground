import { createRegionTree } from '../seed.mjs';

// 2026-07-01 행정통합: 광주광역시 + 전라남도 → 전남광주통합특별시.
// 저장된 유저 프로필의 provinceName만 새 이름으로 재기록한다 — cityName/districtName은
// 그대로 두어야 한다 (광주 구 유저는 cityName '' + 구, 전남 시군 유저는
// cityName === districtName 이 리그 롤업/개인 랭킹 키의 전제 조건).
export const MERGED_REGION_PROVINCE_NAME = '전남광주통합특별시';
export const LEGACY_MERGED_PROVINCE_NAMES = new Set(['광주광역시', '전라남도']);

export function migrateRegionMergeStore(store) {
  let changed = false;

  for (const user of store.users ?? []) {
    if (LEGACY_MERGED_PROVINCE_NAMES.has(user.provinceName)) {
      user.provinceName = MERGED_REGION_PROVINCE_NAME;
      changed = true;
    }
  }

  // postgres 드라이버는 저장된 regionTree를 절대 재계산하지 않으므로 (json 드라이버만
  // load/save 때 재구성) 유저 재기록 여부와 별개로, 트리에 폐지된 시·도 노드가 남아
  // 있으면 그 자리에서 새 카탈로그 기준으로 재구성한다. (유저는 이미 이관됐는데
  // 트리만 낡은 채 저장된 블롭도 이 분기로 치유된다.)
  const treeHasLegacyProvince = (store.regionTree?.children ?? [])
    .some((province) => LEGACY_MERGED_PROVINCE_NAMES.has(province?.name));

  if (changed || treeHasLegacyProvince) {
    store.regionTree = createRegionTree(store);
    changed = true;
  }

  return changed;
}
