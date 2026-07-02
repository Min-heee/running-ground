// 순수 in-memory 고정 윈도우 rate limiter 모음.
//
// 외부 의존성 없이 프로세스 메모리(Map)만 사용한다. 백엔드는 단일 인스턴스로 돌기 때문에
// 프로세스 로컬 카운터로도 SMS 폭탄/로그인 브루트포스 같은 남용을 충분히 막을 수 있다.
// 재시작하면 카운터가 리셋되지만, 여기서 지키려는 건 정확한 회계가 아니라 과금 폭탄 방지다.
//
// 메모리 관리: 접근한 키는 만료 시 즉시 지우고(lazy expiry), 엔트리 수가 hard cap에 닿으면
// 전체 sweep으로 만료 엔트리를 정리한다. 그래도 자리가 없으면 새 키를 거부한다(fail-closed) —
// 메모리를 무한히 늘리는 것보다 잠깐 429를 주는 쪽이 안전하다.

const DEFAULT_MAX_ENTRIES = 10_000;

function toRetryAfterSeconds(resetAtMs, nowMs) {
  return Math.max(1, Math.ceil((resetAtMs - nowMs) / 1000));
}

/**
 * 고정 윈도우 카운터 limiter.
 * consume(key, now) → { allowed, retryAfterSeconds } (allowed=true면 카운트 1 소모)
 */
export function createRateLimiter({ windowMs, max, maxEntries = DEFAULT_MAX_ENTRIES }) {
  const entries = new Map();

  function sweepExpired(nowMs) {
    for (const [key, entry] of entries) {
      if (entry.resetAt <= nowMs) {
        entries.delete(key);
      }
    }
  }

  function consume(key, now = Date.now()) {
    let entry = entries.get(key);

    if (entry && entry.resetAt <= now) {
      entries.delete(key);
      entry = undefined;
    }

    if (!entry) {
      if (entries.size >= maxEntries) {
        sweepExpired(now);
      }

      if (entries.size >= maxEntries) {
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(windowMs / 1000)) };
      }

      entry = { count: 0, resetAt: now + windowMs };
      entries.set(key, entry);
    }

    if (entry.count >= max) {
      return { allowed: false, retryAfterSeconds: toRetryAfterSeconds(entry.resetAt, now) };
    }

    entry.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return {
    consume,
    size: () => entries.size,
  };
}

/**
 * 키별 "서로 다른 값" 개수 limiter (예: IP당 하루에 요청 가능한 서로 다른 전화번호 수).
 * 이미 본 값을 다시 소모해도 새 카운트를 쓰지 않는다(같은 번호 재요청은 자유).
 * consume(key, value, now) → { allowed, retryAfterSeconds }
 */
export function createUniqueValueLimiter({ windowMs, max, maxEntries = DEFAULT_MAX_ENTRIES }) {
  const entries = new Map();

  function sweepExpired(nowMs) {
    for (const [key, entry] of entries) {
      if (entry.resetAt <= nowMs) {
        entries.delete(key);
      }
    }
  }

  function consume(key, value, now = Date.now()) {
    let entry = entries.get(key);

    if (entry && entry.resetAt <= now) {
      entries.delete(key);
      entry = undefined;
    }

    if (!entry) {
      if (entries.size >= maxEntries) {
        sweepExpired(now);
      }

      if (entries.size >= maxEntries) {
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(windowMs / 1000)) };
      }

      entry = { values: new Set(), resetAt: now + windowMs };
      entries.set(key, entry);
    }

    if (entry.values.has(value)) {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (entry.values.size >= max) {
      return { allowed: false, retryAfterSeconds: toRetryAfterSeconds(entry.resetAt, now) };
    }

    entry.values.add(value);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return {
    consume,
    size: () => entries.size,
  };
}

/**
 * 요청의 클라이언트 IP를 구한다.
 *
 * X-Forwarded-For는 클라이언트가 마음대로 넣을 수 있는 헤더라서 기본으로는 믿지 않는다.
 * BACKEND_TRUST_PROXY=true일 때(= 우리 리버스 프록시가 신뢰할 수 없는 클라이언트의 XFF를
 * 지우거나 덮어쓰도록 구성돼 있을 때)만 XFF의 첫 번째 주소를 클라이언트 IP로 쓴다.
 * 그 외에는 소켓의 remoteAddress를 그대로 쓴다(프록시 뒤라면 프록시 IP가 나오지만,
 * 스푸핑 가능한 값으로 rate limit 키를 만드는 것보다 낫다).
 */
export function resolveClientIp(request, { trustProxy = false } = {}) {
  if (trustProxy) {
    const forwarded = request?.headers?.['x-forwarded-for'];

    if (typeof forwarded === 'string') {
      const first = forwarded.split(',')[0].trim();

      if (first) {
        return first;
      }
    }
  }

  return request?.socket?.remoteAddress || 'unknown';
}

/**
 * SMS 인증번호 발송(request-code)용 계층형 가드.
 * check({ ip, phone, now }) → { allowed, reason, retryAfterSeconds }
 * reason: 'per_ip' | 'unique_phones_per_ip' | 'per_phone' | 'global' | null
 *
 * 전역 카운터는 마지막에 검사한다 — IP/번호 단계에서 이미 막힌 공격 트래픽이
 * 전역 일일 예산까지 태워서 정상 사용자 SMS를 막는 일이 없도록.
 */
export function createSmsRequestCodeGuard({
  perIpPerHour,
  uniquePhonesPerIpPerDay,
  perPhonePerDay,
  globalPerDay,
}) {
  const HOUR_MS = 60 * 60 * 1000;
  const DAY_MS = 24 * HOUR_MS;
  const perIpLimiter = createRateLimiter({ windowMs: HOUR_MS, max: perIpPerHour });
  const uniquePhonesLimiter = createUniqueValueLimiter({ windowMs: DAY_MS, max: uniquePhonesPerIpPerDay });
  const perPhoneLimiter = createRateLimiter({ windowMs: DAY_MS, max: perPhonePerDay });
  const globalLimiter = createRateLimiter({ windowMs: DAY_MS, max: globalPerDay });

  function check({ ip, phone, now = Date.now() }) {
    const perIp = perIpLimiter.consume(ip, now);

    if (!perIp.allowed) {
      return { allowed: false, reason: 'per_ip', retryAfterSeconds: perIp.retryAfterSeconds };
    }

    const uniquePhones = uniquePhonesLimiter.consume(ip, phone, now);

    if (!uniquePhones.allowed) {
      return { allowed: false, reason: 'unique_phones_per_ip', retryAfterSeconds: uniquePhones.retryAfterSeconds };
    }

    const perPhone = perPhoneLimiter.consume(phone, now);

    if (!perPhone.allowed) {
      return { allowed: false, reason: 'per_phone', retryAfterSeconds: perPhone.retryAfterSeconds };
    }

    const global = globalLimiter.consume('global', now);

    if (!global.allowed) {
      return { allowed: false, reason: 'global', retryAfterSeconds: global.retryAfterSeconds };
    }

    return { allowed: true, reason: null, retryAfterSeconds: 0 };
  }

  return { check };
}

/**
 * 로그인용 가드: IP당 분당 + 계정당 시간당.
 * check({ ip, username, now }) → { allowed, reason, retryAfterSeconds }
 * reason: 'per_ip' | 'per_account' | null
 */
export function createLoginGuard({ perIpPerMinute, perAccountPerHour }) {
  const MINUTE_MS = 60 * 1000;
  const HOUR_MS = 60 * MINUTE_MS;
  const perIpLimiter = createRateLimiter({ windowMs: MINUTE_MS, max: perIpPerMinute });
  const perAccountLimiter = createRateLimiter({ windowMs: HOUR_MS, max: perAccountPerHour });

  function check({ ip, username, now = Date.now() }) {
    const perIp = perIpLimiter.consume(ip, now);

    if (!perIp.allowed) {
      return { allowed: false, reason: 'per_ip', retryAfterSeconds: perIp.retryAfterSeconds };
    }

    const perAccount = perAccountLimiter.consume(username, now);

    if (!perAccount.allowed) {
      return { allowed: false, reason: 'per_account', retryAfterSeconds: perAccount.retryAfterSeconds };
    }

    return { allowed: true, reason: null, retryAfterSeconds: 0 };
  }

  return { check };
}
