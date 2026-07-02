import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLoginGuard,
  createRateLimiter,
  createSmsRequestCodeGuard,
  createUniqueValueLimiter,
  resolveClientIp,
} from './rateLimiter.mjs';

const BASE_NOW = Date.parse('2026-07-01T00:00:00.000Z');

test('createRateLimiter allows up to max and reports retryAfterSeconds when blocked', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });

  assert.deepEqual(limiter.consume('ip-1', BASE_NOW), { allowed: true, retryAfterSeconds: 0 });
  assert.deepEqual(limiter.consume('ip-1', BASE_NOW + 1000), { allowed: true, retryAfterSeconds: 0 });

  const blocked = limiter.consume('ip-1', BASE_NOW + 2000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 58);
});

test('createRateLimiter isolates keys from each other', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });

  assert.equal(limiter.consume('ip-1', BASE_NOW).allowed, true);
  assert.equal(limiter.consume('ip-1', BASE_NOW).allowed, false);
  assert.equal(limiter.consume('ip-2', BASE_NOW).allowed, true);
});

test('createRateLimiter rolls the window over after windowMs', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });

  assert.equal(limiter.consume('ip-1', BASE_NOW).allowed, true);
  assert.equal(limiter.consume('ip-1', BASE_NOW + 59_999).allowed, false);
  assert.equal(limiter.consume('ip-1', BASE_NOW + 60_000).allowed, true);
});

test('createRateLimiter enforces the hard entry cap fail-closed and recovers after expiry', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 5, maxEntries: 2 });

  assert.equal(limiter.consume('ip-1', BASE_NOW).allowed, true);
  assert.equal(limiter.consume('ip-2', BASE_NOW).allowed, true);

  // 캡이 가득 찼고 만료된 엔트리도 없으면 새 키는 거부.
  const overflow = limiter.consume('ip-3', BASE_NOW + 1000);
  assert.equal(overflow.allowed, false);
  assert.equal(overflow.retryAfterSeconds, 60);
  assert.equal(limiter.size(), 2);

  // 기존 키는 캡과 무관하게 계속 동작.
  assert.equal(limiter.consume('ip-1', BASE_NOW + 1000).allowed, true);

  // 윈도우가 지나면 sweep으로 만료 엔트리가 비워져 새 키를 받는다.
  assert.equal(limiter.consume('ip-3', BASE_NOW + 61_000).allowed, true);
  assert.equal(limiter.size(), 1);
});

test('createUniqueValueLimiter does not charge repeats of the same value', () => {
  const limiter = createUniqueValueLimiter({ windowMs: 60_000, max: 2 });

  assert.equal(limiter.consume('ip-1', 'phone-a', BASE_NOW).allowed, true);
  assert.equal(limiter.consume('ip-1', 'phone-a', BASE_NOW).allowed, true);
  assert.equal(limiter.consume('ip-1', 'phone-b', BASE_NOW).allowed, true);

  const blocked = limiter.consume('ip-1', 'phone-c', BASE_NOW + 30_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 30);

  // 이미 등록된 값은 한도를 넘어도 계속 허용.
  assert.equal(limiter.consume('ip-1', 'phone-b', BASE_NOW + 30_000).allowed, true);

  // 윈도우 롤오버 후에는 새 값도 다시 허용.
  assert.equal(limiter.consume('ip-1', 'phone-c', BASE_NOW + 60_000).allowed, true);
});

test('resolveClientIp uses the socket address when trustProxy is off', () => {
  const request = {
    headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    socket: { remoteAddress: '10.0.0.9' },
  };

  assert.equal(resolveClientIp(request), '10.0.0.9');
  assert.equal(resolveClientIp(request, { trustProxy: false }), '10.0.0.9');
});

test('resolveClientIp honors the first X-Forwarded-For entry only with trustProxy', () => {
  const request = {
    headers: { 'x-forwarded-for': ' 1.2.3.4 , 5.6.7.8' },
    socket: { remoteAddress: '10.0.0.9' },
  };

  assert.equal(resolveClientIp(request, { trustProxy: true }), '1.2.3.4');
});

test('resolveClientIp falls back to the socket, then to "unknown"', () => {
  assert.equal(resolveClientIp({ headers: {}, socket: { remoteAddress: '10.0.0.9' } }, { trustProxy: true }), '10.0.0.9');
  assert.equal(resolveClientIp({ headers: { 'x-forwarded-for': '   ' }, socket: {} }, { trustProxy: true }), 'unknown');
  assert.equal(resolveClientIp({ headers: {} }), 'unknown');
});

test('createSmsRequestCodeGuard blocks each layer with its own reason', () => {
  const guard = createSmsRequestCodeGuard({
    perIpPerHour: 2,
    uniquePhonesPerIpPerDay: 2,
    perPhonePerDay: 10,
    globalPerDay: 100,
  });

  assert.equal(guard.check({ ip: 'ip-1', phone: '01011112222', now: BASE_NOW }).allowed, true);
  assert.equal(guard.check({ ip: 'ip-1', phone: '01011112222', now: BASE_NOW }).allowed, true);

  const perIp = guard.check({ ip: 'ip-1', phone: '01011112222', now: BASE_NOW });
  assert.equal(perIp.allowed, false);
  assert.equal(perIp.reason, 'per_ip');
  assert.equal(perIp.retryAfterSeconds > 0, true);
});

test('createSmsRequestCodeGuard blocks distinct phone rotation per IP (unique_phones_per_ip)', () => {
  const guard = createSmsRequestCodeGuard({
    perIpPerHour: 100,
    uniquePhonesPerIpPerDay: 2,
    perPhonePerDay: 10,
    globalPerDay: 100,
  });

  assert.equal(guard.check({ ip: 'ip-2', phone: '01000000001', now: BASE_NOW }).allowed, true);
  assert.equal(guard.check({ ip: 'ip-2', phone: '01000000002', now: BASE_NOW }).allowed, true);

  const blocked = guard.check({ ip: 'ip-2', phone: '01000000003', now: BASE_NOW });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, 'unique_phones_per_ip');

  // 이미 쓰던 번호 재요청은 계속 허용.
  assert.equal(guard.check({ ip: 'ip-2', phone: '01000000001', now: BASE_NOW }).allowed, true);
});

test('createSmsRequestCodeGuard blocks a single phone across IPs (per_phone)', () => {
  const guard = createSmsRequestCodeGuard({
    perIpPerHour: 100,
    uniquePhonesPerIpPerDay: 100,
    perPhonePerDay: 2,
    globalPerDay: 100,
  });

  assert.equal(guard.check({ ip: 'ip-1', phone: '01011112222', now: BASE_NOW }).allowed, true);
  assert.equal(guard.check({ ip: 'ip-2', phone: '01011112222', now: BASE_NOW }).allowed, true);

  const blocked = guard.check({ ip: 'ip-3', phone: '01011112222', now: BASE_NOW });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, 'per_phone');
});

test('createSmsRequestCodeGuard enforces the global daily budget last', () => {
  const guard = createSmsRequestCodeGuard({
    perIpPerHour: 100,
    uniquePhonesPerIpPerDay: 100,
    perPhonePerDay: 100,
    globalPerDay: 2,
  });

  assert.equal(guard.check({ ip: 'ip-1', phone: '01000000001', now: BASE_NOW }).allowed, true);
  assert.equal(guard.check({ ip: 'ip-2', phone: '01000000002', now: BASE_NOW }).allowed, true);

  const blocked = guard.check({ ip: 'ip-3', phone: '01000000003', now: BASE_NOW });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, 'global');

  // 하루가 지나면 다시 허용.
  assert.equal(guard.check({ ip: 'ip-3', phone: '01000000003', now: BASE_NOW + 24 * 60 * 60 * 1000 }).allowed, true);
});

test('createLoginGuard limits per IP per minute and per account per hour', () => {
  const guard = createLoginGuard({ perIpPerMinute: 2, perAccountPerHour: 3 });

  assert.equal(guard.check({ ip: 'ip-1', username: 'runner', now: BASE_NOW }).allowed, true);
  assert.equal(guard.check({ ip: 'ip-1', username: 'runner', now: BASE_NOW }).allowed, true);

  const perIp = guard.check({ ip: 'ip-1', username: 'runner', now: BASE_NOW });
  assert.equal(perIp.allowed, false);
  assert.equal(perIp.reason, 'per_ip');

  // 1분 뒤 IP 윈도우는 풀리지만 계정 시간당 한도(3회 소진)가 잡는다.
  const perAccount = guard.check({ ip: 'ip-1', username: 'runner', now: BASE_NOW + 60_000 });
  assert.equal(perAccount.allowed, true);
  const perAccountBlocked = guard.check({ ip: 'ip-1', username: 'runner', now: BASE_NOW + 120_000 });
  assert.equal(perAccountBlocked.allowed, false);
  assert.equal(perAccountBlocked.reason, 'per_account');

  // 다른 계정은 영향 없음.
  assert.equal(guard.check({ ip: 'ip-2', username: 'other', now: BASE_NOW + 120_000 }).allowed, true);
});
