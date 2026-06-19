import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addressCatalog, type AddressRegionNode } from './addressCatalog';
import { deriveSignupTerminalRegion } from './signupRegionCap';

function findProvince(name: string): AddressRegionNode {
  const province = addressCatalog.find((region) => region.name === name);
  assert.ok(province, `province ${name} should exist in the catalog`);
  return province;
}

function findChild(province: AddressRegionNode, name: string): AddressRegionNode {
  const child = province.children?.find((region) => region.name === name);
  assert.ok(child, `${name} should exist under ${province.name}`);
  return child;
}

test('서울특별시 2nd-level 구 stays terminal (district, no city, no 3rd level)', () => {
  const province = findProvince('서울특별시');
  const gangnam = findChild(province, '강남구');

  const terminal = deriveSignupTerminalRegion(province.name, gangnam);

  assert.equal(terminal.finalRegion, gangnam);
  assert.equal(terminal.finalDistrictName, '강남구');
  assert.equal(terminal.finalCityName, '');
  assert.equal(terminal.selectedAddressLabel, '서울특별시 강남구');
  // Address label must never contain a third path segment.
  assert.equal(terminal.selectedAddressLabel.split(' ').length, 2);
});

test('경기도 고양시 is a leaf 시 and sends cityName===districtName===고양시', () => {
  const province = findProvince('경기도');
  const goyang = findChild(province, '고양시');

  // The pruned catalog makes 고양시 a leaf (no 구 children) …
  assert.equal(goyang.type, 'city');
  assert.equal(goyang.children?.length ?? 0, 0, '고양시 should be a leaf city with no 구 children');

  // … and the terminal payload matches the backend childless-city contract.
  const terminal = deriveSignupTerminalRegion(province.name, goyang);

  assert.equal(terminal.finalRegion, goyang);
  assert.equal(terminal.finalCityName, '고양시');
  // districtName MUST equal the city name (NOT empty) for the childless-city branch.
  assert.equal(terminal.finalDistrictName, '고양시');
  assert.equal(terminal.selectedAddressLabel, '경기도 고양시');
  // No 일산서구 / 덕양구 / 일산동구 third segment.
  assert.equal(terminal.selectedAddressLabel.split(' ').length, 2);
  assert.ok(!terminal.selectedAddressLabel.endsWith('구'));
});

test('every 경기도 시/군 is a leaf and sends cityName===districtName===name', () => {
  const province = findProvince('경기도');
  const cities = (province.children ?? []).filter((child) => child.type === 'city');

  assert.ok(cities.length > 0, 'expected 경기도 to have 시/군 children');

  for (const city of cities) {
    assert.equal(city.children?.length ?? 0, 0, `${city.name} should be a leaf city`);

    const terminal = deriveSignupTerminalRegion(province.name, city);
    assert.equal(terminal.finalCityName, city.name);
    assert.equal(terminal.finalDistrictName, city.name);
    assert.equal(terminal.selectedAddressLabel, `경기도 ${city.name}`);
    assert.equal(terminal.selectedAddressLabel.split(' ').length, 2);
  }
});

test('no province ever produces a region payload that needs a 3rd path segment', () => {
  for (const province of addressCatalog) {
    for (const secondary of province.children ?? []) {
      // The catalog is two levels deep now: provinces hold leaf 시/군/구 only.
      assert.equal(
        secondary.children?.length ?? 0,
        0,
        `${province.name} ${secondary.name} must be a leaf (no 3rd level)`,
      );

      const terminal = deriveSignupTerminalRegion(province.name, secondary);
      // The label is always province + secondary (two segments), never three.
      const segments = terminal.selectedAddressLabel.split(' ').filter(Boolean);
      assert.equal(segments.length, 2, `${province.name} ${secondary.name} must be 2 segments`);
      if (secondary.type === 'city') {
        // Leaf city: both fields carry the city name (childless-city contract).
        assert.equal(terminal.finalCityName, secondary.name);
        assert.equal(terminal.finalDistrictName, secondary.name);
      } else {
        // Metro 구: terminal district, no city.
        assert.equal(terminal.finalDistrictName, secondary.name);
        assert.equal(terminal.finalCityName, '');
      }
    }
  }
});

test('an empty 2nd-level pick yields an empty terminal region', () => {
  const terminal = deriveSignupTerminalRegion('경기도', null);
  assert.equal(terminal.finalRegion, null);
  assert.equal(terminal.finalCityName, '');
  assert.equal(terminal.finalDistrictName, '');
  assert.equal(terminal.selectedAddressLabel, '경기도');
});
