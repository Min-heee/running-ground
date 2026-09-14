import assert from 'node:assert/strict';
import test from 'node:test';

import { getRunOutcome } from './runOutcome';

test('solo run has no outcome mark', () => {
  assert.equal(getRunOutcome({}), null);
});

test('disqualification wins over the rank stamped on the same blob', () => {
  // 그룹 실격 블롭에는 rank가 같이 박힌다 — 판정 순서가 뒤집히면 실격이 순위로 둔갑한다.
  const disqualified = {
    matchResult: {
      mode: 'group' as const,
      title: '',
      summary: '',
      badgeLabel: '실격패',
      rank: 3,
      participantCount: 5,
      disqualified: true,
    },
  };

  assert.deepEqual(getRunOutcome(disqualified), { label: '실격', tone: 'lose' });
});

test('group run without a rank is still being settled', () => {
  const pending = {
    matchResult: {
      mode: 'group' as const,
      title: '',
      summary: '',
      badgeLabel: '결과 집계 중',
      participantCount: 4,
    },
  };

  assert.deepEqual(getRunOutcome(pending), { label: '집계 중', tone: 'pending' });
});

test('a one-participant group win is not celebrated as 1위', () => {
  // 혼자 남아 기권하면 서버가 participantCount 1 / rank 1을 박는다.
  const lonely = {
    matchResult: {
      mode: 'group' as const,
      title: '',
      summary: '',
      badgeLabel: '기권',
      rank: 1,
      participantCount: 1,
    },
  };

  assert.deepEqual(getRunOutcome(lonely), { label: '1위', tone: 'rank' });
});

test('group placements read as rank, with first place toned apart', () => {
  const base = { mode: 'group' as const, title: '', summary: '', badgeLabel: '', participantCount: 6 };

  assert.deepEqual(getRunOutcome({ matchResult: { ...base, rank: 1 } }), { label: '1위', tone: 'top' });
  assert.deepEqual(getRunOutcome({ matchResult: { ...base, rank: 4 } }), { label: '4위', tone: 'rank' });
});

test('duel outcomes map to one syllable each', () => {
  const base = { mode: 'duel' as const, title: '', summary: '', badgeLabel: '' };

  assert.deepEqual(getRunOutcome({ matchResult: { ...base, resultTone: 'win' } }), { label: '승', tone: 'win' });
  assert.deepEqual(getRunOutcome({ matchResult: { ...base, resultTone: 'lose' } }), { label: '패', tone: 'lose' });
  assert.deepEqual(getRunOutcome({ matchResult: { ...base, resultTone: 'draw' } }), { label: '무', tone: 'draw' });
  assert.deepEqual(getRunOutcome({ matchResult: base }), { label: '집계 중', tone: 'pending' });
});
