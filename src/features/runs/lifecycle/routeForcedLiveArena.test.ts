import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRouteForcedLiveArena } from '@/features/runs/lifecycle/routeForcedLiveArena';
import {
  markRouteFocusMatchTerminated,
  resetTerminatedRouteFocusMatchesForTest,
} from '@/features/runs/lifecycle/terminatedRouteFocusMatch';
import { resolveTrackRunLiveShellGate } from '@/features/runs/lifecycle/trackRunLiveShellGate';

// The running-tab shell renders the LIVE measuring view whenever shouldShowReadyScreen is
// false. shouldShowReadyScreen = isIdle && !shouldRenderLiveArena && !hasLinkedRuntimeRoom,
// and shouldRenderLiveArena is driven by shouldForceLiveArenaFromRoute (the stale route
// force). These tests model that gate end-to-end through the two pure pieces.
function resolveRunningTabShowsReadyScreen(options: {
  forceLiveArenaFromRoute: boolean;
  isIdle: boolean;
  hasLinkedRuntimeRoom: boolean;
  hydratedFocusMatchId?: string | null;
  hydratedForceMatchArena?: boolean | null;
}) {
  const shouldRenderLiveArena = options.forceLiveArenaFromRoute;
  const requestedShouldShowReadyScreen =
    options.isIdle && !shouldRenderLiveArena && !options.hasLinkedRuntimeRoom;

  const gate = resolveTrackRunLiveShellGate({
    focusMatchId: options.hydratedFocusMatchId ?? undefined,
    forceMatchArena: options.hydratedForceMatchArena ?? undefined,
    // The reservation / room-start handoff that strands the running tab does NOT pass a
    // routeShellHint, so the gate respects requestedShouldShowReadyScreen.
    requestedShell: requestedShouldShowReadyScreen ? 'idle' : 'live',
    requestedShouldShowReadyScreen,
    showLiveArena: shouldRenderLiveArena,
  });

  return gate.shouldShowReadyScreen;
}

test('after a finished/forfeited match + exit, the stale forceMatchArena route no longer forces the live arena', () => {
  resetTerminatedRouteFocusMatchesForTest();

  // The reservation / room-start handoff left forceMatchArena=1 + focusMatchId on the
  // running-tab route. Before the post-run reset tombstones the match, the route forces
  // the live arena (this is the regression we are fixing).
  const beforeReset = resolveRouteForcedLiveArena({
    isRunning: false,
    // Post-run reset has already cleared the duel/group statuses, so the in-component
    // done-match guard reports false here — which is exactly why the bug surfaced.
    currentUserDoneWithCurrentMatch: false,
    hydratedFocusMatchId: 'ended-duel-match',
    hydratedForceMatchArena: true,
  });
  assert.equal(beforeReset, true);
  assert.equal(
    resolveRunningTabShowsReadyScreen({
      forceLiveArenaFromRoute: beforeReset,
      isIdle: true,
      hasLinkedRuntimeRoom: false,
      hydratedFocusMatchId: 'ended-duel-match',
      hydratedForceMatchArena: true,
    }),
    false,
    'without the fix the running tab is stuck on the live measuring shell',
  );

  // The post-run reset tombstones the ended match id.
  markRouteFocusMatchTerminated('ended-duel-match');

  const afterReset = resolveRouteForcedLiveArena({
    isRunning: false,
    currentUserDoneWithCurrentMatch: false,
    hydratedFocusMatchId: 'ended-duel-match',
    hydratedForceMatchArena: true,
  });
  assert.equal(afterReset, false, 'the stale route must not re-open the live arena');
  assert.equal(
    resolveRunningTabShowsReadyScreen({
      forceLiveArenaFromRoute: afterReset,
      isIdle: true,
      hasLinkedRuntimeRoom: false,
      hydratedFocusMatchId: 'ended-duel-match',
      hydratedForceMatchArena: true,
    }),
    true,
    'the running tab resolves to the clean ready/idle setup view',
  );

  resetTerminatedRouteFocusMatchesForTest();
});

test('an in-progress match still shows the live arena even if its id was previously tombstoned', () => {
  resetTerminatedRouteFocusMatchesForTest();
  // Defensive: even a stale tombstone must never reset a genuinely running race, because the
  // suppression is gated on !isRunning.
  markRouteFocusMatchTerminated('live-duel-match');

  const decision = resolveRouteForcedLiveArena({
    isRunning: true,
    currentUserDoneWithCurrentMatch: false,
    hydratedFocusMatchId: 'live-duel-match',
    hydratedForceMatchArena: true,
  });

  assert.equal(decision, true);
  assert.equal(
    resolveRunningTabShowsReadyScreen({
      forceLiveArenaFromRoute: decision,
      isIdle: false,
      hasLinkedRuntimeRoom: false,
      hydratedFocusMatchId: 'live-duel-match',
      hydratedForceMatchArena: true,
    }),
    false,
    'an in-progress race keeps the live view',
  );

  resetTerminatedRouteFocusMatchesForTest();
});

test('the reservation handoff for a brand-new match still force-opens the arena (no false suppression)', () => {
  resetTerminatedRouteFocusMatchesForTest();
  // A previous match was tombstoned, but the new reservation handoff targets a different id.
  markRouteFocusMatchTerminated('previous-ended-match');

  const decision = resolveRouteForcedLiveArena({
    isRunning: false,
    currentUserDoneWithCurrentMatch: false,
    hydratedFocusMatchId: 'fresh-reservation-match',
    hydratedForceMatchArena: true,
  });

  assert.equal(decision, true, 'a fresh handoff match must still open the arena');

  resetTerminatedRouteFocusMatchesForTest();
});

test('a route-hydration preferArena focus is also suppressed once its match terminates', () => {
  resetTerminatedRouteFocusMatchesForTest();

  const beforeReset = resolveRouteForcedLiveArena({
    isRunning: false,
    currentUserDoneWithCurrentMatch: false,
    hydratedFocusMatchId: 'group-match',
    routeHydrationMatchId: 'group-match',
    routeHydrationPreferArena: true,
  });
  assert.equal(beforeReset, true);

  markRouteFocusMatchTerminated('group-match');

  const afterReset = resolveRouteForcedLiveArena({
    isRunning: false,
    currentUserDoneWithCurrentMatch: false,
    hydratedFocusMatchId: 'group-match',
    routeHydrationMatchId: 'group-match',
    routeHydrationPreferArena: true,
  });
  assert.equal(afterReset, false);

  resetTerminatedRouteFocusMatchesForTest();
});

test('in-component done-match guard still suppresses before the reset (no tombstone yet)', () => {
  resetTerminatedRouteFocusMatchesForTest();

  const decision = resolveRouteForcedLiveArena({
    isRunning: false,
    currentUserDoneWithCurrentMatch: true,
    hydratedFocusMatchId: 'duel-match',
    hydratedForceMatchArena: true,
  });

  assert.equal(decision, false, 'the original done-match guard path is preserved');

  resetTerminatedRouteFocusMatchesForTest();
});
