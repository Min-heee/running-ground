import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addressCatalog, type AddressRegionNode } from '@/features/location/addressCatalog';
import { deriveSignupTerminalRegion } from '@/features/location/signupRegionCap';

/**
 * The settings region-change flow now mirrors signup: it picks a region in two
 * steps (시/도 → 시/군/구) and derives its SUBMITTED payload from
 * deriveSignupTerminalRegion, so it must produce the SAME payload signup does.
 *
 * useRegionSettings resolves the second-level pick by name (via
 * buildRegionSelectionState) and then feeds the resolved node to the shared
 * terminal helper. We replicate that name→node lookup here without importing
 * RegionSelection (which pulls in react-native), keeping the test pure like
 * signupRegionDepthCap.test.ts.
 */
function resolveSecondaryByName(provinceName: string, secondaryRegionName: string): AddressRegionNode | null {
  const province = addressCatalog.find((region) => region.name === provinceName) ?? null;
  return province?.children?.find((region) => region.name === secondaryRegionName) ?? null;
}

function deriveSettingsSubmitPayload(provinceName: string, secondaryRegionName: string) {
  return deriveSignupTerminalRegion(provinceName, resolveSecondaryByName(provinceName, secondaryRegionName));
}

test('settings: 경기도→고양시 submits cityName===districtName===고양시 (NOT empty)', () => {
  const payload = deriveSettingsSubmitPayload('경기도', '고양시');

  assert.equal(payload.finalCityName, '고양시');
  // districtName MUST equal the city name (NOT '') for the backend childless-city branch.
  assert.equal(payload.finalDistrictName, '고양시');
  assert.equal(payload.selectedAddressLabel, '경기도 고양시');
  // Never a third (구) path segment.
  assert.equal(payload.selectedAddressLabel.split(' ').length, 2);
});

test('settings: 서울특별시→강남구 stays terminal (district, no city, no 3rd level)', () => {
  const payload = deriveSettingsSubmitPayload('서울특별시', '강남구');

  assert.equal(payload.finalCityName, '');
  assert.equal(payload.finalDistrictName, '강남구');
  assert.equal(payload.selectedAddressLabel, '서울특별시 강남구');
  assert.equal(payload.selectedAddressLabel.split(' ').length, 2);
});

test('settings: payload matches signup for every province/second-level pick', () => {
  for (const province of addressCatalog) {
    for (const secondary of province.children ?? []) {
      // The settings hook resolves the pick by name; signup holds the node directly.
      const settingsPayload = deriveSettingsSubmitPayload(province.name, secondary.name);
      const signupPayload = deriveSignupTerminalRegion(province.name, secondary);

      assert.equal(settingsPayload.finalCityName, signupPayload.finalCityName);
      assert.equal(settingsPayload.finalDistrictName, signupPayload.finalDistrictName);
      assert.equal(settingsPayload.selectedAddressLabel, signupPayload.selectedAddressLabel);

      if (secondary.type === 'city') {
        // Leaf 시/군: both fields carry the city name (childless-city contract).
        assert.equal(settingsPayload.finalCityName, secondary.name);
        assert.equal(settingsPayload.finalDistrictName, secondary.name);
      } else {
        // Metro 구: terminal district, no city.
        assert.equal(settingsPayload.finalCityName, '');
        assert.equal(settingsPayload.finalDistrictName, secondary.name);
      }
    }
  }
});

test('settings: an empty 2nd-level pick yields an empty terminal payload', () => {
  const payload = deriveSettingsSubmitPayload('경기도', '');

  assert.equal(payload.finalCityName, '');
  assert.equal(payload.finalDistrictName, '');
  assert.equal(payload.selectedAddressLabel, '경기도');
});
