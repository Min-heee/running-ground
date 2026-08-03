// 목표 직접 입력 정규화의 계약: 클램프(0.5~99.9)·1dp 반올림·쉼표 허용·불량은 null.

import assert from 'node:assert/strict';
import test from 'node:test';

import { formatGoalInputKm, parseGoalInputKm } from './soloRunGoalStore';

test('정상 입력은 1dp로 반올림된다', () => {
  assert.equal(parseGoalInputKm('5'), 5);
  assert.equal(parseGoalInputKm('7.25'), 7.3);
  assert.equal(parseGoalInputKm('42.195'), 42.2);
  assert.equal(parseGoalInputKm('3,5'), 3.5);
});

test('범위 밖은 0.5~99.9로 클램프된다', () => {
  assert.equal(parseGoalInputKm('0.1'), 0.5);
  assert.equal(parseGoalInputKm('250'), 99.9);
});

test('못 읽는 입력은 null — 호출자가 이전 값을 유지한다', () => {
  assert.equal(parseGoalInputKm(''), null);
  assert.equal(parseGoalInputKm('abc'), null);
  assert.equal(parseGoalInputKm('0'), null);
  assert.equal(parseGoalInputKm('-3'), null);
});

test('표시 포맷: 정수는 그대로, 소수는 한 자리', () => {
  assert.equal(formatGoalInputKm(5), '5');
  assert.equal(formatGoalInputKm(7.5), '7.5');
});
