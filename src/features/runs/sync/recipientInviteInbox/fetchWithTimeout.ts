import { fetchRunningMatchRoomInviteInbox } from '@/services';
import type { RecipientInviteInboxFetchResult } from './types';

export const RECIPIENT_INVITE_INBOX_FETCH_TIMEOUT_MS = 5000;

export async function fetchRecipientInviteInboxWithTimeout({
  timeoutMs = RECIPIENT_INVITE_INBOX_FETCH_TIMEOUT_MS,
}: {
  timeoutMs?: number;
} = {}): Promise<RecipientInviteInboxFetchResult> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      resolve({ timedOut: true });
    }, timeoutMs);
  });

  const requestPromise = fetchRunningMatchRoomInviteInbox({ signal: controller.signal })
    .then((payload) => ({ payload, timedOut: false as const }))
    .catch((error) => {
      if (controller.signal.aborted) {
        return { timedOut: true as const };
      }

      throw error;
    });

  const result = await Promise.race([
    requestPromise,
    timeoutPromise,
  ]);

  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  return result;
}
