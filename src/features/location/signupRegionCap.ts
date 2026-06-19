import type { AddressRegionNode } from './addressCatalog';

/**
 * Signup picks a region in two steps (시/도 → 시/군/구). With the pruned
 * catalog every 시/군 is a leaf node (no 구 children), so the second-level pick
 * is always terminal — 고양·성남·수원·용인 등 included. This derives the terminal
 * region payload from a province + second-level pick so it satisfies the backend
 * region contract (resolveRegionSelection):
 *
 *  - a metro 구 pick (type 'district', e.g. 서울특별시 → 강남구) sends
 *    cityName='' and districtName=district.name (the level-2 district is terminal).
 *  - a 시/군 pick (type 'city', e.g. 경기도 → 고양시) sends BOTH
 *    cityName=city.name AND districtName=city.name. The backend treats a childless
 *    city as terminal and requires districtName===city.name, so districtName must
 *    NOT be empty here.
 *
 * Kept in a pure (RN-free) module so it can be unit-tested without react-native.
 */
export function deriveSignupTerminalRegion(
  provinceName: string,
  selectedSecondary: AddressRegionNode | null,
) {
  const isCity = selectedSecondary?.type === 'city';
  const secondaryRegionName = selectedSecondary?.name ?? '';

  return {
    finalRegion: selectedSecondary,
    // A leaf 시/군 stores {cityName: name, districtName: name}; a metro 구 stores
    // {cityName: '', districtName: name}. Both match the backend contract.
    finalCityName: isCity ? secondaryRegionName : '',
    finalDistrictName: secondaryRegionName,
    selectedAddressLabel: [provinceName, secondaryRegionName].filter(Boolean).join(' '),
  };
}
