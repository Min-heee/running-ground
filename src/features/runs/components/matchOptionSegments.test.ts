import assert from 'node:assert/strict';
import test from 'node:test';

import type { MatchOptionItem } from '@/features/runs/components/MatchOptionSelector';
import {
  buildMatchOptionSegments,
  resolveActiveMatchOptionSegment,
  resolveSegmentSelection,
  shouldRenderMatchOptionCards,
} from './matchOptionSegments';

const OPTIONS: MatchOptionItem[] = [
  { mode: 'solo', title: '혼자 러닝' },
  { mode: 'duel', title: '1대1 매치' },
  { mode: 'group', title: '그룹 대결' },
  { mode: 'chase', title: '경찰과 도둑' },
  { mode: 'room', title: '파티런' },
];

test('모드는 혼자 / 매칭 / 파티런 세 묶음으로 갈린다', () => {
  const segments = buildMatchOptionSegments(OPTIONS);

  assert.deepEqual(
    segments.map((segment) => [segment.id, segment.options.map((option) => option.mode)]),
    [
      ['alone', ['solo', 'chase']],
      ['compete', ['duel', 'group']],
      ['friends', ['room']],
    ],
  );
});

test('옵션이 없는 묶음은 탭으로 만들지 않는다', () => {
  // 경찰과 도둑이 빠져도 '혼자'는 혼자 러닝으로 남고, 빈 탭은 생기지 않는다.
  const segments = buildMatchOptionSegments(OPTIONS.filter((option) => option.mode !== 'room'));

  assert.deepEqual(segments.map((segment) => segment.id), ['alone', 'compete']);
});

test('활성 묶음은 선택된 모드에서 파생된다', () => {
  const segments = buildMatchOptionSegments(OPTIONS);

  assert.equal(resolveActiveMatchOptionSegment(segments, 'chase')?.id, 'alone');
  assert.equal(resolveActiveMatchOptionSegment(segments, 'group')?.id, 'compete');
  assert.equal(resolveActiveMatchOptionSegment(segments, 'room')?.id, 'friends');
});

test('묶음을 누르면 그 묶음의 첫 모드를 고른다', () => {
  const segments = buildMatchOptionSegments(OPTIONS);

  assert.equal(resolveSegmentSelection(segments, 'compete', 'solo')?.mode, 'duel');
  assert.equal(resolveSegmentSelection(segments, 'friends', 'solo')?.mode, 'room');
});

test('이미 그 묶음 안이면 고른 모드를 리셋하지 않는다', () => {
  const segments = buildMatchOptionSegments(OPTIONS);

  // 매칭 안에서 그룹 대결을 고른 상태로 '매칭'을 다시 눌러도 1대1로 돌아가면 안 된다.
  assert.equal(resolveSegmentSelection(segments, 'compete', 'group'), null);
  assert.equal(resolveSegmentSelection(segments, 'alone', 'chase'), null);
});

test('없는 묶음을 눌러도 아무 일도 일어나지 않는다', () => {
  const segments = buildMatchOptionSegments(OPTIONS);

  assert.equal(resolveSegmentSelection(segments, 'nope', 'solo'), null);
});

test('모드가 하나뿐인 묶음은 카드를 그리지 않는다', () => {
  // 파티런 탭 아래 '파티런' 카드가 또 나오면 같은 말이 두 번이고, 고를 것도 없다.
  const segments = buildMatchOptionSegments(OPTIONS);
  const friends = segments.find((segment) => segment.id === 'friends') ?? null;
  const compete = segments.find((segment) => segment.id === 'compete') ?? null;

  assert.equal(shouldRenderMatchOptionCards(friends), false);
  assert.equal(shouldRenderMatchOptionCards(compete), true);
  assert.equal(shouldRenderMatchOptionCards(null), false);
});
