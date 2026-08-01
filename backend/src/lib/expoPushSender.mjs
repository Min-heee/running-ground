// Expo Push 발송기 (오너 2026-07-31: 공지사항을 폰 알림으로).
//
// 왜 Expo Push인가: 앱이 이미 expo-notifications로 빌드돼 있어 APNs/FCM을 직접 다루지
// 않고 Expo 게이트웨이(https://exp.host/--/api/v2/push/send)로 한 번에 보낼 수 있다.
//
// 운영 계약:
//  - 발송은 fire-and-forget. 관리자 요청(공지 등록)은 푸시 실패로 절대 실패하지 않는다.
//  - 100개씩 청크 (Expo 권장 상한).
//  - 응답의 DeviceNotRegistered 티켓은 죽은 토큰이므로 스토어에서 지운다 (onInvalidTokens).
//  - 네트워크는 10초 타임아웃 — 드롭릿의 단일 라이터를 막지 않게.

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const PUSH_CHUNK_SIZE = 100;
const PUSH_TIMEOUT_MS = 10_000;

function chunk(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

// tokens: Expo 푸시 토큰 배열 — 문자열, 또는 { token, badge } (수신자별 아이콘 배지 숫자,
// 카카오톡식 쌓임 — iOS가 이 값을 앱 아이콘에 찍는다). message: { title, body, data }.
// deps: { fetchImpl, onInvalidTokens } — 테스트에서 주입.
export async function sendExpoPushNotifications(tokens, message, {
  fetchImpl = globalThis.fetch,
  onInvalidTokens = null,
} = {}) {
  const seenTokens = new Set();
  const targets = [];

  for (const raw of tokens ?? []) {
    const entry = typeof raw === 'string' ? { token: raw } : raw;
    const token = typeof entry?.token === 'string' ? entry.token.trim() : '';

    if (!token || seenTokens.has(token)) {
      continue;
    }

    seenTokens.add(token);
    targets.push({
      token,
      ...(Number.isInteger(entry?.badge) && entry.badge >= 0 ? { badge: entry.badge } : {}),
    });
  }

  if (targets.length === 0 || typeof fetchImpl !== 'function') {
    return { sent: 0, failed: 0, invalidTokens: [] };
  }

  const title = String(message?.title ?? '').trim();
  const body = String(message?.body ?? '').trim();

  if (!title || !body) {
    return { sent: 0, failed: 0, invalidTokens: [] };
  }

  const invalidTokens = [];
  let sent = 0;
  let failed = 0;

  for (const batch of chunk(targets, PUSH_CHUNK_SIZE)) {
    const payload = batch.map((entry) => ({
      to: entry.token,
      title,
      body,
      sound: 'default',
      ...(typeof entry.badge === 'number' ? { badge: entry.badge } : {}),
      // 앱이 알림을 눌렀을 때 어디로 갈지 등의 라우팅 재료.
      ...(message?.data ? { data: message.data } : {}),
    }));

    try {
      const response = await fetchImpl(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
      });

      if (!response.ok) {
        failed += batch.length;
        continue;
      }

      const result = await response.json();
      const tickets = Array.isArray(result?.data) ? result.data : [];

      tickets.forEach((ticket, index) => {
        if (ticket?.status === 'ok') {
          sent += 1;
          return;
        }

        failed += 1;

        // 앱을 지웠거나 토큰이 만료된 기기 — 다시 보내봐야 계속 실패한다.
        if (ticket?.details?.error === 'DeviceNotRegistered' && batch[index]) {
          invalidTokens.push(batch[index].token);
        }
      });
    } catch {
      // 타임아웃/네트워크 오류 — 이 배치는 포기 (재시도 큐는 과설계).
      failed += batch.length;
    }
  }

  if (invalidTokens.length > 0 && typeof onInvalidTokens === 'function') {
    try {
      await onInvalidTokens(invalidTokens);
    } catch {
      // 정리 실패는 다음 발송 때 다시 시도된다.
    }
  }

  return { sent, failed, invalidTokens };
}
