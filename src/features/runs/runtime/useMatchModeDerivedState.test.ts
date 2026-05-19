import assert from 'node:assert/strict';
import test from 'node:test';
import type { PartyRunLinkedMatchContext } from '@/features/runs/lifecycle/matchStateMachine';
import {
  resolveArenaOpenState,
  resolveArenaUsesLivePace,
  resolveMatchModeIdentity,
  resolveOfficialCurrentAveragePace,
  shouldStageLiveMatchStartup,
} from './useMatchModeDerivedState';

const linkedDuelContext: PartyRunLinkedMatchContext = {
  mode: 'duel',
  matchId: 'linked-duel',
  slotStartAt: '2026-05-19T12:00:00.000Z',
  distanceKm: 3,
  state: 'active',
};

const linkedGroupContext: PartyRunLinkedMatchContext = {
  mode: 'group',
  matchId: 'linked-group',
  slotStartAt: '2026-05-19T12:00:00.000Z',
  distanceKm: 5,
  state: 'matched',
};

test('resolveMatchModeIdentity keeps duel priority order', () => {
  assert.equal(resolveMatchModeIdentity({
    matchMode: 'duel',
    duelMatchId: 'status-duel',
    roomLinkedMatchMode: linkedDuelContext.mode,
    roomLinkedMatchId: linkedDuelContext.matchId,
    hydratedFocusMatchMode: 'duel',
    hydratedFocusMatchId: 'hydrated-duel',
    fallbackMatchId: 'fallback-duel',
  }), 'status-duel');

  assert.equal(resolveMatchModeIdentity({
    matchMode: 'duel',
    roomLinkedMatchMode: linkedDuelContext.mode,
    roomLinkedMatchId: linkedDuelContext.matchId,
    hydratedFocusMatchMode: 'duel',
    hydratedFocusMatchId: 'hydrated-duel',
    fallbackMatchId: 'fallback-duel',
  }), 'linked-duel');

  assert.equal(resolveMatchModeIdentity({
    matchMode: 'duel',
    hydratedFocusMatchMode: 'duel',
    hydratedFocusMatchId: 'hydrated-duel',
    fallbackMatchId: 'fallback-duel',
  }), 'hydrated-duel');
});

test('resolveMatchModeIdentity keeps group and non-match fallback behavior', () => {
  assert.equal(resolveMatchModeIdentity({
    matchMode: 'group',
    groupMatchId: 'status-group',
    roomLinkedMatchMode: linkedGroupContext.mode,
    roomLinkedMatchId: linkedGroupContext.matchId,
    hydratedFocusMatchMode: 'group',
    hydratedFocusMatchId: 'hydrated-group',
    fallbackMatchId: 'fallback-group',
  }), 'status-group');

  assert.equal(resolveMatchModeIdentity({
    matchMode: 'solo',
    defaultMatchId: 'route-match',
    fallbackMatchId: 'ignored-fallback',
  }), 'route-match');
});

test('shouldStageLiveMatchStartup follows existing match-mode gates', () => {
  assert.equal(shouldStageLiveMatchStartup({
    liveMatchStartupIdentity: null,
    matchMode: 'duel',
    isRunning: true,
    forceOpenActiveMatch: false,
    partyRunShouldOpenArena: false,
    duelMatchState: 'active',
    groupMatchState: 'idle',
    duelStartCountdownSeconds: null,
    groupStartCountdownSeconds: null,
    roomLinkedMatchContext: null,
  }), false);

  assert.equal(shouldStageLiveMatchStartup({
    liveMatchStartupIdentity: 'duel-match',
    matchMode: 'duel',
    isRunning: false,
    forceOpenActiveMatch: false,
    partyRunShouldOpenArena: false,
    duelMatchState: 'matched',
    groupMatchState: 'idle',
    duelStartCountdownSeconds: 3,
    groupStartCountdownSeconds: null,
    roomLinkedMatchContext: null,
  }), true);

  assert.equal(shouldStageLiveMatchStartup({
    liveMatchStartupIdentity: 'room-match',
    matchMode: 'room',
    isRunning: true,
    forceOpenActiveMatch: true,
    partyRunShouldOpenArena: true,
    duelMatchState: 'active',
    groupMatchState: 'active',
    duelStartCountdownSeconds: 0,
    groupStartCountdownSeconds: 0,
    roomLinkedMatchContext: linkedDuelContext,
  }), false);
});

test('resolveArenaUsesLivePace and official pace remain mode-specific', () => {
  assert.deepEqual(resolveArenaUsesLivePace({
    matchMode: 'duel',
    duelMatchState: 'matched',
    groupMatchState: 'active',
    roomLinkedMatchContext: linkedDuelContext,
  }), {
    duelArenaUsesLivePace: true,
    groupArenaUsesLivePace: false,
  });

  assert.equal(resolveOfficialCurrentAveragePace({
    matchMode: 'group',
    duelAveragePace: '4:10/km',
    groupAveragePace: '5:30/km',
  }), '5:30/km');
});

test('resolveArenaOpenState preserves countdown and force-open flags', () => {
  assert.deepEqual(resolveArenaOpenState({
    duelMatchState: 'matched',
    groupMatchState: 'matched',
    duelStartCountdownSeconds: 5,
    groupStartCountdownSeconds: null,
    partyRunLinkedMatchId: 'room-match',
    partyRunShouldOpenArena: false,
    forceOpenActiveMatch: true,
  }), {
    duelShouldOpenCountdownArena: true,
    groupShouldOpenCountdownArena: false,
    roomShouldOpenCountdownArena: true,
    duelShouldHoldArenaDuringActivation: true,
    groupShouldHoldArenaDuringActivation: true,
  });
});
