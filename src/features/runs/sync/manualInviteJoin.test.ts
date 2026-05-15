import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildManualInviteJoinKey,
  getManualInviteJoinDuplicateReason,
  MANUAL_INVITE_CODE_JOIN_SOURCE,
  startManualInviteJoinSingleFlight,
  type ManualInviteJoinSingleFlightState,
} from './manualInviteJoin';

test('manual invite join key normalizes invite tokens for single-flight reuse', () => {
  assert.equal(buildManualInviteJoinKey(' ab12cd '), 'AB12CD');
});

test('manual invite join uses one canonical submit owner label', () => {
  assert.equal(MANUAL_INVITE_CODE_JOIN_SOURCE, 'manual invite code submit');
});

test('manual invite join duplicate guard reuses the same token request', () => {
  assert.equal(getManualInviteJoinDuplicateReason({
    activeJoinKey: 'AB12CD',
    inviteToken: 'ab12cd',
    isJoining: false,
  }), 'same-token');
});

test('manual invite join duplicate guard blocks unrelated in-flight joins', () => {
  assert.equal(getManualInviteJoinDuplicateReason({
    activeJoinKey: null,
    inviteToken: 'EF34GH',
    isJoining: true,
  }), 'in-flight');
});

test('same inviteToken submit reuses one manual join request', async () => {
  const singleFlightRef: { current: ManualInviteJoinSingleFlightState } = {
    current: null,
  };
  let runCount = 0;
  let resolveRun: () => void = () => {};

  const first = startManualInviteJoinSingleFlight(singleFlightRef, {
    inviteToken: 'ab12cd',
    isJoining: false,
    run: () => new Promise<void>((resolve) => {
      runCount += 1;
      resolveRun = resolve;
    }),
  });
  const second = startManualInviteJoinSingleFlight(singleFlightRef, {
    inviteToken: ' AB12CD ',
    isJoining: true,
    run: async () => {
      runCount += 1;
    },
  });

  assert.equal(first.status, 'started');
  assert.equal(second.status, 'reused');
  assert.equal(first.promise, second.promise);

  await Promise.resolve();
  assert.equal(runCount, 1);
  resolveRun();
  await first.promise;
  assert.equal(singleFlightRef.current, null);
});

test('party panel and track-run input simultaneous submit share the manual join owner', async () => {
  const singleFlightRef: { current: ManualInviteJoinSingleFlightState } = {
    current: null,
  };
  let runCount = 0;

  const partyPanelSubmit = startManualInviteJoinSingleFlight(singleFlightRef, {
    inviteToken: 'DUEL99',
    isJoining: false,
    run: async () => {
      runCount += 1;
    },
  });
  const trackRunInputSubmit = startManualInviteJoinSingleFlight(singleFlightRef, {
    inviteToken: 'duel99',
    isJoining: false,
    run: async () => {
      runCount += 1;
    },
  });

  assert.equal(partyPanelSubmit.status, 'started');
  assert.equal(trackRunInputSubmit.status, 'reused');
  await Promise.all([partyPanelSubmit.promise, trackRunInputSubmit.promise]);
  assert.equal(runCount, 1);
});
