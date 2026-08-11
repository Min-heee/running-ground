import assert from 'node:assert/strict';
import test from 'node:test';

import { isMatchBonusPending } from '@/features/running/viewModels/matchBonusPending';

// 2026-08-11 테스트런 사건 모양: 그룹 3위로 먼저 완주 → 저장 블롭에 rank가 아직 없음 → 카드가
// "+0P"를 박제. 이 창에서만 '집계 중' 표기가 켜져야 한다.

test('그룹: rank 없는 저장 직후 블롭만 PENDING, 확정 rank가 오면 꺼진다', () => {
  assert.equal(isMatchBonusPending({ mode: 'group' }, false), true);
  assert.equal(isMatchBonusPending({ mode: 'group', rank: 3 }, false), false);
  // 방어: 0/음수 rank는 확정으로 치지 않는다 (지급 로직 getMatchBonusPoints와 같은 경계).
  assert.equal(isMatchBonusPending({ mode: 'group', rank: 0 }, false), true);
});

test('듀얼: resultTone이 확정의 표식 — lose여도 지급(+10P)이므로 PENDING 아님', () => {
  assert.equal(isMatchBonusPending({ mode: 'duel' }, false), true);
  assert.equal(isMatchBonusPending({ mode: 'duel', resultTone: 'lose' }, false), false);
  assert.equal(isMatchBonusPending({ mode: 'duel', resultTone: 'win' }, false), false);
});

test('terminal 오버레이(영구 미확정 종결)와 매치 아님은 절대 PENDING이 아니다', () => {
  // §3-⑦ 종결 기록: 진짜 0P — '집계 중'으로 영원히 기다리는 것처럼 보이면 안 된다.
  assert.equal(isMatchBonusPending({ mode: 'group' }, true), false);
  assert.equal(isMatchBonusPending(null, false), false);
});
