import assert from 'node:assert/strict';
import test from 'node:test';

import { getRunKind, isMatchRecordRun } from './runKind';

test('run kind classifies solo runs without match results', () => {
  assert.equal(getRunKind({}), 'solo');
  assert.equal(isMatchRecordRun({}), false);
});

test('run kind classifies party runs from saved match source', () => {
  const partyRun = {
    matchResult: {
      mode: 'duel' as const,
      source: 'party' as const,
      title: '',
      summary: '',
      badgeLabel: '',
    },
  };

  assert.equal(getRunKind(partyRun), 'party');
  assert.equal(isMatchRecordRun(partyRun), false);
});

test('run kind classifies official and legacy match results as match records', () => {
  const officialRun = {
    matchResult: {
      mode: 'group' as const,
      source: 'official' as const,
      title: '',
      summary: '',
      badgeLabel: '',
    },
  };
  const legacyRun = {
    matchResult: {
      mode: 'duel' as const,
      title: '',
      summary: '',
      badgeLabel: '',
    },
  };

  assert.equal(getRunKind(officialRun), 'match');
  assert.equal(isMatchRecordRun(officialRun), true);
  assert.equal(getRunKind(legacyRun), 'match');
  assert.equal(isMatchRecordRun(legacyRun), true);
});
