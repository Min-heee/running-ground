import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OTA_ROOM_SIGNAL_FRESH_MS,
  OTA_UPDATE_CHECK_THROTTLE_MS,
  isRoomCheckSignalActive,
  shouldOfferOtaUpdate,
  shouldRunOtaUpdateCheck,
  shouldAutoApplyOtaUpdate,
  OTA_AUTO_APPLY_LAUNCH_WINDOW_MS,
} from '@/features/home/utils/otaUpdatePrompt';

test('shouldOfferOtaUpdate offers only when an update is ready and no run is active', () => {
  assert.equal(shouldOfferOtaUpdate({ hasUpdateReady: true, isRunActive: false, isDev: false }), true);
  assert.equal(shouldOfferOtaUpdate({ hasUpdateReady: false, isRunActive: false, isDev: false }), false);
});

test('shouldOfferOtaUpdate NEVER offers while a run/match could be active', () => {
  // The catastrophe case: update fetched and ready, but the user is mid-run.
  assert.equal(shouldOfferOtaUpdate({ hasUpdateReady: true, isRunActive: true, isDev: false }), false);
});

test('shouldOfferOtaUpdate never offers in dev builds', () => {
  assert.equal(shouldOfferOtaUpdate({ hasUpdateReady: true, isRunActive: false, isDev: true }), false);
});

test('shouldRunOtaUpdateCheck allows a first check when idle in a release build', () => {
  assert.equal(shouldRunOtaUpdateCheck({
    isDev: false,
    isUpdatesEnabled: true,
    isRunActive: false,
    nowMs: 1_000_000,
    lastCheckAtMs: null,
  }), true);
});

test('shouldRunOtaUpdateCheck skips dev builds and disabled updates', () => {
  assert.equal(shouldRunOtaUpdateCheck({
    isDev: true,
    isUpdatesEnabled: true,
    isRunActive: false,
    nowMs: 1_000_000,
    lastCheckAtMs: null,
  }), false);
  assert.equal(shouldRunOtaUpdateCheck({
    isDev: false,
    isUpdatesEnabled: false,
    isRunActive: false,
    nowMs: 1_000_000,
    lastCheckAtMs: null,
  }), false);
});

test('shouldRunOtaUpdateCheck skips while a run is active', () => {
  assert.equal(shouldRunOtaUpdateCheck({
    isDev: false,
    isUpdatesEnabled: true,
    isRunActive: true,
    nowMs: 1_000_000,
    lastCheckAtMs: null,
  }), false);
});

test('shouldRunOtaUpdateCheck throttles to once per 15 minutes', () => {
  const lastCheckAtMs = 10_000_000;

  // 1ms short of the throttle window — still suppressed.
  assert.equal(shouldRunOtaUpdateCheck({
    isDev: false,
    isUpdatesEnabled: true,
    isRunActive: false,
    nowMs: lastCheckAtMs + OTA_UPDATE_CHECK_THROTTLE_MS - 1,
    lastCheckAtMs,
  }), false);

  // Exactly at the window boundary — allowed again.
  assert.equal(shouldRunOtaUpdateCheck({
    isDev: false,
    isUpdatesEnabled: true,
    isRunActive: false,
    nowMs: lastCheckAtMs + OTA_UPDATE_CHECK_THROTTLE_MS,
    lastCheckAtMs,
  }), true);
});

test('shouldRunOtaUpdateCheck fails closed on non-finite clock input', () => {
  assert.equal(shouldRunOtaUpdateCheck({
    isDev: false,
    isUpdatesEnabled: true,
    isRunActive: false,
    nowMs: Number.NaN,
    lastCheckAtMs: null,
  }), false);
});

test('room-check signal: fresh in-room payload suppresses; stale or roomless does not', () => {
  const nowMs = 1_000_000_000;

  // In a room, cache fresh → active (suppress the prompt).
  assert.equal(
    isRoomCheckSignalActive({ roomId: 'room-1', completedAtMs: nowMs - 5_000, nowMs }),
    true,
  );

  // In a room but the cache is older than the freshness window → not active.
  assert.equal(
    isRoomCheckSignalActive({ roomId: 'room-1', completedAtMs: nowMs - OTA_ROOM_SIGNAL_FRESH_MS - 1, nowMs }),
    false,
  );

  // No room in the payload → never active, regardless of freshness.
  assert.equal(
    isRoomCheckSignalActive({ roomId: null, completedAtMs: nowMs - 1_000, nowMs }),
    false,
  );
  assert.equal(
    isRoomCheckSignalActive({ roomId: undefined, completedAtMs: nowMs, nowMs }),
    false,
  );
});

test('room-check signal fails CLOSED on unreadable clock input', () => {
  assert.equal(
    isRoomCheckSignalActive({ roomId: 'room-1', completedAtMs: Number.NaN, nowMs: 1_000 }),
    true,
  );
});

// 자동 적용 (오너 2026-08-13): 런치 창(60초) 안 + 유휴 + 세션 첫 시도일 때만 — 이 게이트가
// 무너지면 러닝 중 화면 리셋(참사) 또는 무한 reload 루프가 가능해진다.
test('auto-apply: only within the launch window, idle, and once per session', () => {
  const base = { isDev: false, isRunActive: false, hasUpdateReady: true, autoAppliedThisSession: false };

  assert.equal(shouldAutoApplyOtaUpdate({ ...base, appAgeMs: 5_000 }), true);
  assert.equal(shouldAutoApplyOtaUpdate({ ...base, appAgeMs: OTA_AUTO_APPLY_LAUNCH_WINDOW_MS }), true);
  // 런치 창 밖(사용 중) — 카드로 강등.
  assert.equal(shouldAutoApplyOtaUpdate({ ...base, appAgeMs: OTA_AUTO_APPLY_LAUNCH_WINDOW_MS + 1 }), false);
  // 러닝/대결 신호 — 절대 금지.
  assert.equal(shouldAutoApplyOtaUpdate({ ...base, appAgeMs: 5_000, isRunActive: true }), false);
  // 세션 재시도 금지 (reload 실패 루프 차단).
  assert.equal(shouldAutoApplyOtaUpdate({ ...base, appAgeMs: 5_000, autoAppliedThisSession: true }), false);
  assert.equal(shouldAutoApplyOtaUpdate({ ...base, appAgeMs: 5_000, isDev: true }), false);
  assert.equal(shouldAutoApplyOtaUpdate({ ...base, appAgeMs: 5_000, hasUpdateReady: false }), false);
  // 비정상 시계 입력은 fail closed.
  assert.equal(shouldAutoApplyOtaUpdate({ ...base, appAgeMs: Number.NaN }), false);
  assert.equal(shouldAutoApplyOtaUpdate({ ...base, appAgeMs: -1 }), false);
});
