import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveMatchSaveLeavingSource,
  shouldSuppressPostSaveNavigation,
} from './matchSaveLeaving';

describe('resolveMatchSaveLeavingSource (FIX-D1 watchdog overlay gating)', () => {
  it('keeps the small spinner for a pure solo save (no matchId, no matchResult)', () => {
    assert.equal(
      resolveMatchSaveLeavingSource({
        activeMatchId: null,
        hasResolvedMatchResult: false,
        resolvedMatchMode: null,
        callerManagesMatchLeaving: false,
      }),
      null,
    );
  });

  it('raises the duel flag when a matchId resolved even with matchMode demoted (incident shape)', () => {
    // 2026-07-09 incident: matchMode was already 'solo' at tap time; the goal-freeze fallback
    // restored the matchId. The overlay must key off the matchId, not the demoted mode.
    assert.equal(
      resolveMatchSaveLeavingSource({
        activeMatchId: 'match-7km-duel',
        hasResolvedMatchResult: false,
        resolvedMatchMode: 'duel',
        callerManagesMatchLeaving: false,
      }),
      'duel',
    );
  });

  it('defaults to duel when the mode could not be resolved at all', () => {
    assert.equal(
      resolveMatchSaveLeavingSource({
        activeMatchId: 'match-unknown-mode',
        hasResolvedMatchResult: false,
        resolvedMatchMode: null,
        callerManagesMatchLeaving: false,
      }),
      'duel',
    );
  });

  it('raises the group flag for a group-resolved save', () => {
    assert.equal(
      resolveMatchSaveLeavingSource({
        activeMatchId: 'match-group',
        hasResolvedMatchResult: true,
        resolvedMatchMode: 'group',
        callerManagesMatchLeaving: false,
      }),
      'group',
    );
  });

  it('raises the flag when only a matchResult is present (no matchId)', () => {
    assert.equal(
      resolveMatchSaveLeavingSource({
        activeMatchId: null,
        hasResolvedMatchResult: true,
        resolvedMatchMode: 'duel',
        callerManagesMatchLeaving: false,
      }),
      'duel',
    );
  });

  it('never touches the flag when the forfeit-family caller already owns it', () => {
    // skipPostProcessorNavigation callers set setMatchLeaving themselves; the save command
    // clearing the flag in its finally would hide their overlay before their own navigation.
    assert.equal(
      resolveMatchSaveLeavingSource({
        activeMatchId: 'match-forfeit-path',
        hasResolvedMatchResult: true,
        resolvedMatchMode: 'duel',
        callerManagesMatchLeaving: true,
      }),
      null,
    );
  });
});

describe('shouldSuppressPostSaveNavigation (C-1 abandon composition)', () => {
  it('navigates normally when the epoch did not move', () => {
    assert.equal(
      shouldSuppressPostSaveNavigation({
        matchLeavingSource: 'duel',
        entrySaveNavEpoch: 3,
        currentSaveNavEpoch: 3,
      }),
      false,
    );
  });

  it('suppresses the replace after the overlay watchdog abandon bumped the epoch', () => {
    assert.equal(
      shouldSuppressPostSaveNavigation({
        matchLeavingSource: 'duel',
        entrySaveNavEpoch: 3,
        currentSaveNavEpoch: 4,
      }),
      true,
    );
  });

  it('never suppresses a save that did not raise the overlay (solo save, epoch moved elsewhere)', () => {
    assert.equal(
      shouldSuppressPostSaveNavigation({
        matchLeavingSource: null,
        entrySaveNavEpoch: 3,
        currentSaveNavEpoch: 4,
      }),
      false,
    );
  });
});
