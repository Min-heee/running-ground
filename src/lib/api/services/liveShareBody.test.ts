import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLiveSharePatchBody } from '@/lib/api/services/liveShareBody';

// 2026-08-12 근치의 재발 방지 걸쇠: 하트비트가 만든 지도 재료(좌표·거리·페이스·응원허용)가
// PATCH body에서 빠지면 뷰어 지도는 영원히 "친구의 위치를 기다리는 중"이 된다. 이 계약이
// 깨지면(필드 누락 재발) 첫 테스트가 결정적으로 깨진다.

test('하트비트 전 필드가 body에 실린다 — 좌표·거리·페이스·응원허용 포함', () => {
  assert.deepEqual(buildLiveSharePatchBody({
    enabled: true,
    status: 'running',
    locationLabel: ' 일산 호수공원 ',
    latitude: 37.658123,
    longitude: 126.766456,
    distanceKm: 3.51,
    paceLabel: '5:35/km',
    allowCheers: false,
  }), {
    enabled: true,
    status: 'running',
    locationLabel: '일산 호수공원',
    latitude: 37.658123,
    longitude: 126.766456,
    distanceKm: 3.51,
    paceLabel: '5:35/km',
    allowCheers: false,
  });
});

test('전환 호출(좌표 없음)은 최소 필드만 — 반쪽 좌표는 버린다', () => {
  // 시작/종료 전환 호출의 모양 그대로.
  assert.deepEqual(buildLiveSharePatchBody({ enabled: false, status: 'idle' }), {
    enabled: false,
    status: 'idle',
    locationLabel: '',
  });

  // 위도만 있는 비정상 입력 — 좌표 쌍이 아니면 지도 재료로 안 보낸다.
  const halfCoordinate = buildLiveSharePatchBody({
    enabled: true,
    status: 'running',
    latitude: 37.65,
    distanceKm: 0,
  });
  assert.equal('latitude' in halfCoordinate, false);
  assert.equal('longitude' in halfCoordinate, false);
  // 거리 0은 유효한 값이다 (러닝 시작 직후) — 절대 떨어뜨리면 안 된다.
  assert.equal(halfCoordinate.distanceKm, 0);
});
