import assert from 'node:assert/strict';
import test from 'node:test';

import { getRunKind, getRunKindLabel, isMatchRecordRun } from './runKind';

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

test('run kind classifies official match results as match records', () => {
  const officialRun = {
    matchResult: {
      mode: 'group' as const,
      source: 'official' as const,
      title: '',
      summary: '',
      badgeLabel: '',
    },
  };

  assert.equal(getRunKind(officialRun), 'match');
  assert.equal(isMatchRecordRun(officialRun), true);
});

test('run kind treats source-less match results as party runs', () => {
  const sourceLessRun = {
    matchResult: {
      mode: 'duel' as const,
      title: '',
      summary: '',
      badgeLabel: '',
    },
  };

  assert.equal(getRunKind(sourceLessRun), 'party');
  assert.equal(isMatchRecordRun(sourceLessRun), false);
});

test('run kind labels match the filter words shown above the list', () => {
  const solo = { source: 'RunningGround', sourceType: 'runningground' as const };

  assert.equal(getRunKindLabel(solo), '혼자');
  assert.equal(getRunKindLabel({ source: 'Nike Run Club', sourceType: 'nrc' as const }), 'NRC');
  assert.equal(
    getRunKindLabel({
      source: 'RunningGround',
      matchResult: { mode: 'duel', source: 'official', title: '', summary: '', badgeLabel: '' },
    }),
    '매칭',
  );
  assert.equal(
    getRunKindLabel({
      source: 'RunningGround',
      matchResult: { mode: 'group', title: '', summary: '', badgeLabel: '' },
    }),
    '파티런',
  );
});

test('a run with no usable source still reads as a solo run', () => {
  assert.equal(getRunKindLabel({ source: '  ' }), '혼자');
});
