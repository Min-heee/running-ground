import { useCallback, useState } from 'react';
import {
  cancelRunningMatch,
  cleanupStaleRunningMatchRoomState,
  getApiErrorMessage,
  leaveRunningMatch,
  leaveRunningMatchRoom,
} from '@/services';
import type { BlockingMatchReference } from '@/features/runs/components/matchSetupCards/types';

type ForceLeaveStuckMatchInput = {
  roomId?: string | null;
  duelMatch?: BlockingMatchReference | null;
  groupMatch?: BlockingMatchReference | null;
};

type UseForceLeaveStuckMatchOptions = {
  onSettled?: () => Promise<unknown> | unknown;
};

async function runBestEffortAttempt(
  attempt: () => Promise<unknown>,
  report: {
    attempted: boolean;
    lastError: unknown;
    succeeded: boolean;
  },
) {
  report.attempted = true;
  try {
    await attempt();
    report.succeeded = true;
  } catch (error) {
    report.lastError = error;
  }
}

async function forceLeaveMatchReference(
  mode: 'duel' | 'group',
  match: BlockingMatchReference | null | undefined,
  report: {
    attempted: boolean;
    lastError: unknown;
    succeeded: boolean;
  },
) {
  if (!match?.matchId) {
    return;
  }

  const { distanceKm, matchId, slotStartAt } = match;

  if (distanceKm !== null && slotStartAt) {
    await runBestEffortAttempt(
      () => cancelRunningMatch({
        mode,
        distanceKm,
        slotStartAt,
        testMode: Boolean(match.testMode),
        matchId,
      }),
      report,
    );
  }

  await runBestEffortAttempt(
    () => leaveRunningMatch({ matchId }),
    report,
  );
}

async function runStaleCleanupAttempt(report: {
  attempted: boolean;
  lastError: unknown;
  succeeded: boolean;
}) {
  report.attempted = true;
  try {
    const payload = await cleanupStaleRunningMatchRoomState();
    if (payload.cleaned || !payload.blocker) {
      report.succeeded = true;
      return;
    }

    report.lastError = new Error(payload.message ?? '이전 방·매치 상태가 아직 서버에 남아 있어요.');
  } catch (error) {
    report.lastError = error;
  }
}

export function useForceLeaveStuckMatch(options: UseForceLeaveStuckMatchOptions = {}) {
  const { onSettled } = options;
  const [isLeaving, setIsLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const forceLeave = useCallback(async ({
    roomId,
    duelMatch,
    groupMatch,
  }: ForceLeaveStuckMatchInput) => {
    if (isLeaving) {
      return;
    }

    const report = {
      attempted: false,
      lastError: null as unknown,
      succeeded: false,
    };

    setIsLeaving(true);
    setError(null);

    try {
      if (roomId) {
        await runBestEffortAttempt(
          () => leaveRunningMatchRoom({ roomId }),
          report,
        );
      }

      await forceLeaveMatchReference('duel', duelMatch, report);
      await forceLeaveMatchReference('group', groupMatch, report);

      await runStaleCleanupAttempt(report);

      if (report.attempted && !report.succeeded && report.lastError) {
        setError(getApiErrorMessage(report.lastError, '이전 방·매치 상태를 정리하지 못했어요.'));
      }
    } finally {
      try {
        await onSettled?.();
      } finally {
        setIsLeaving(false);
      }
    }
  }, [isLeaving, onSettled]);

  return {
    error,
    forceLeave,
    isLeaving,
  };
}
