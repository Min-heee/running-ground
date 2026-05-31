import assert from 'node:assert/strict';
import test from 'node:test';
import type { DuelMatchResultRowModel } from '@/features/runs/types/matchResult';
import {
  resolveDuelBadgeLabel,
  resolveDuelCurrentRowLabel,
  resolveDuelOpponentRowLabels,
  resolveDuelResultTone,
  resolveDuelRowOrder,
  resolveDuelSummary,
  resolveDuelTitle,
  resolveGroupRowLabels,
  resolveGroupStatusLabel,
  resolveGroupSummary,
  resolveGroupTitle,
} from './matchResultRowsPolicy';

function duelRow(overrides: Partial<DuelMatchResultRowModel> = {}): DuelMatchResultRowModel {
  return {
    id: 'row',
    resultLabel: 'WIN',
    name: '러너',
    paceLabel: '05:00/km',
    durationLabel: '25:00',
    distanceKm: 5,
    isCurrentUser: false,
    ...overrides,
  };
}

test('duel policy keeps forfeits, in-progress, draw, and distance result tones stable', () => {
  assert.equal(resolveDuelResultTone({
    currentForfeited: true,
    opponentForfeited: false,
    opponentInProgress: false,
    isDraw: false,
    currentDistanceKm: 5,
    opponentDistanceKm: 1,
  }), 'lose');
  assert.equal(resolveDuelResultTone({
    currentForfeited: false,
    opponentForfeited: true,
    opponentInProgress: false,
    isDraw: false,
    currentDistanceKm: 1,
    opponentDistanceKm: 5,
  }), 'win');
  assert.equal(resolveDuelResultTone({
    currentForfeited: false,
    opponentForfeited: false,
    opponentInProgress: true,
    isDraw: false,
    currentDistanceKm: 5,
    opponentDistanceKm: 1,
  }), 'win');
  assert.equal(resolveDuelResultTone({
    currentForfeited: false,
    opponentForfeited: false,
    opponentInProgress: false,
    isDraw: true,
    currentDistanceKm: 5,
    opponentDistanceKm: 5,
  }), 'draw');
  assert.equal(resolveDuelResultTone({
    currentForfeited: false,
    opponentForfeited: false,
    opponentInProgress: false,
    isDraw: false,
    currentDistanceKm: 4.9,
    opponentDistanceKm: 5,
  }), 'lose');
});

test('duel policy preserves title, summary, and badge text for progressive result states', () => {
  assert.equal(resolveDuelTitle({
    opponentName: '상대',
    currentForfeited: false,
    opponentForfeited: false,
    opponentInProgress: true,
    isDraw: false,
    resultTone: 'win',
  }), '상대님보다 먼저 완주했어요');
  assert.equal(resolveDuelSummary({
    currentForfeited: false,
    opponentForfeited: false,
    opponentInProgress: true,
    isDraw: false,
    resultTone: 'win',
    currentDistanceKm: 5,
    gapKm: 3.9,
  }), '상대가 완주하면 결과표가 자동으로 업데이트돼요.');
  assert.equal(resolveDuelBadgeLabel({
    currentForfeited: false,
    opponentForfeited: false,
    isDraw: false,
    resultTone: 'win',
  }), '승리');
  assert.equal(resolveDuelBadgeLabel({
    currentForfeited: true,
    opponentForfeited: false,
    isDraw: false,
    resultTone: 'lose',
  }), '기권 패');
});

test('duel policy preserves row labels and ordering', () => {
  assert.equal(resolveDuelCurrentRowLabel({
    isDraw: true,
    resultTone: 'draw',
    currentForfeited: false,
  }), 'DRAW');
  assert.equal(resolveDuelCurrentRowLabel({
    isDraw: false,
    resultTone: 'lose',
    currentForfeited: true,
  }), 'FORFEIT');
  assert.deepEqual(resolveDuelOpponentRowLabels({
    opponentInProgress: true,
    isDraw: false,
    resultTone: 'win',
    opponentForfeited: false,
    opponentPaceLabel: '06:00/km',
    opponentDurationLabel: '30:00',
    opponentHasLiveProgress: true,
  }), {
    resultLabel: 'ING',
    paceLabel: '06:00/km',
    durationLabel: '30:00',
  });
  assert.deepEqual(resolveDuelOpponentRowLabels({
    opponentInProgress: true,
    isDraw: false,
    resultTone: 'win',
    opponentForfeited: false,
    opponentPaceLabel: '동기화 중',
    opponentDurationLabel: '30:00',
    opponentHasLiveProgress: false,
  }), {
    resultLabel: 'ING',
    paceLabel: '진행 중',
    durationLabel: '-',
  });
  assert.deepEqual(resolveDuelOpponentRowLabels({
    opponentInProgress: false,
    isDraw: false,
    resultTone: 'lose',
    opponentForfeited: false,
    opponentPaceLabel: '06:00/km',
    opponentDurationLabel: '30:00',
    opponentHasLiveProgress: false,
  }), {
    resultLabel: 'WIN',
    paceLabel: '06:00/km',
    durationLabel: '30:00',
  });
  assert.deepEqual(resolveDuelOpponentRowLabels({
    opponentInProgress: false,
    isDraw: false,
    resultTone: 'win',
    opponentForfeited: true,
    opponentPaceLabel: '기권',
    opponentDurationLabel: '30:00',
    opponentHasLiveProgress: false,
  }), {
    resultLabel: 'FORFEIT',
    paceLabel: '기권',
    durationLabel: '30:00',
  });

  const currentRow = duelRow({ id: 'me', resultLabel: 'LOSER', isCurrentUser: true });
  const opponentRow = duelRow({ id: 'opponent', resultLabel: 'WIN' });

  assert.deepEqual(resolveDuelRowOrder({
    currentRow,
    opponentRow,
    opponentInProgress: false,
    isDraw: false,
  }).map((row) => row.id), ['opponent', 'me']);
  assert.deepEqual(resolveDuelRowOrder({
    currentRow,
    opponentRow,
    opponentInProgress: true,
    isDraw: false,
  }).map((row) => row.id), ['me', 'opponent']);
});

test('group policy preserves title, summary, row placeholders, and status text', () => {
  assert.equal(resolveGroupTitle({
    currentForfeited: false,
    currentRank: 1,
    participantCount: 3,
  }), '1위로 마무리했어요');
  assert.equal(resolveGroupTitle({
    currentForfeited: false,
    currentRank: 2,
    participantCount: 3,
  }), '3명 중 2위로 마쳤어요');
  assert.equal(resolveGroupTitle({
    currentForfeited: true,
    currentRank: 3,
    participantCount: 3,
  }), '기권으로 그룹 대결을 마쳤어요');
  assert.equal(resolveGroupSummary({
    currentForfeited: false,
    currentRank: 2,
    participantCount: 3,
    gapAheadKm: 0.24,
  }), '앞 사람과 0.24km 차이였어요.');
  assert.deepEqual(resolveGroupRowLabels({
    isInProgress: true,
    isCurrentUser: false,
    currentPaceLabel: '05:00/km',
    participantPaceLabel: '06:00/km',
    durationLabel: '30:00',
    participantHasLiveProgress: true,
  }), {
    paceLabel: '06:00/km',
    durationLabel: '30:00',
    isInProgress: true,
  });
  assert.deepEqual(resolveGroupRowLabels({
    isInProgress: true,
    isCurrentUser: false,
    currentPaceLabel: '05:00/km',
    participantPaceLabel: '동기화 중',
    durationLabel: '30:00',
    participantHasLiveProgress: false,
  }), {
    paceLabel: '진행 중',
    durationLabel: '-',
    isInProgress: true,
  });
  assert.deepEqual(resolveGroupRowLabels({
    isInProgress: false,
    isCurrentUser: true,
    currentPaceLabel: '05:00/km',
    participantPaceLabel: '06:00/km',
    durationLabel: '30:00',
    participantHasLiveProgress: false,
  }), {
    paceLabel: '05:00/km',
    durationLabel: '30:00',
    isInProgress: false,
  });
  assert.equal(resolveGroupStatusLabel({
    hasRows: true,
    hasOngoing: true,
  }), '진행중 · 들어오는 대로 순위가 계속 업데이트돼요.');
  assert.equal(resolveGroupStatusLabel({
    hasRows: false,
    hasOngoing: false,
  }), null);
});
