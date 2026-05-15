export type ManualInviteJoinDuplicateReason =
  | 'in-flight'
  | 'same-token';

export type ManualInviteJoinSingleFlightState = {
  key: string;
  promise: Promise<void>;
} | null;

type ManualInviteJoinSingleFlightRef = {
  current: ManualInviteJoinSingleFlightState;
};

type StartManualInviteJoinSingleFlightInput = {
  inviteToken: string;
  isJoining: boolean;
  run: () => Promise<void>;
};

export type ManualInviteJoinSingleFlightStart =
  | {
      reason: null;
      status: 'started';
      promise: Promise<void>;
    }
  | {
      reason: ManualInviteJoinDuplicateReason;
      status: 'reused';
      promise: Promise<void>;
    }
  | {
      reason: ManualInviteJoinDuplicateReason;
      status: 'blocked';
      promise: Promise<void>;
    };

export function buildManualInviteJoinKey(inviteToken: string) {
  return inviteToken.trim().toUpperCase();
}

export function getManualInviteJoinDuplicateReason({
  activeJoinKey,
  inviteToken,
  isJoining,
}: {
  activeJoinKey?: string | null;
  inviteToken: string;
  isJoining: boolean;
}): ManualInviteJoinDuplicateReason | null {
  const joinKey = buildManualInviteJoinKey(inviteToken);

  if (activeJoinKey && joinKey && activeJoinKey === joinKey) {
    return 'same-token';
  }

  if (isJoining) {
    return 'in-flight';
  }

  return null;
}

export function startManualInviteJoinSingleFlight(
  singleFlightRef: ManualInviteJoinSingleFlightRef,
  {
    inviteToken,
    isJoining,
    run,
  }: StartManualInviteJoinSingleFlightInput,
): ManualInviteJoinSingleFlightStart {
  const joinKey = buildManualInviteJoinKey(inviteToken);
  const duplicateReason = getManualInviteJoinDuplicateReason({
    activeJoinKey: singleFlightRef.current?.key ?? null,
    inviteToken,
    isJoining,
  });

  if (duplicateReason === 'same-token' && singleFlightRef.current?.promise) {
    return {
      reason: duplicateReason,
      status: 'reused',
      promise: singleFlightRef.current.promise,
    };
  }

  if (duplicateReason) {
    return {
      reason: duplicateReason,
      status: 'blocked',
      promise: Promise.resolve(),
    };
  }

  const promise = Promise.resolve()
    .then(run)
    .finally(() => {
      if (singleFlightRef.current?.key === joinKey) {
        singleFlightRef.current = null;
      }
    });

  singleFlightRef.current = {
    key: joinKey,
    promise,
  };

  return {
    reason: null,
    status: 'started',
    promise,
  };
}
