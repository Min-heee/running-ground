import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildForfeiterAnnouncement,
  resolveForfeitProcessedLabel,
  resolveForfeitStatusLabel,
  resolveOpponentForfeitTitle,
} from './matchForfeitLabels';

test('기권 라벨: disqualified:true 일 때만 실격, 없거나 false/null 이면 오늘의 기권', () => {
  assert.equal(resolveForfeitStatusLabel(true), '실격');
  assert.equal(resolveForfeitStatusLabel(false), '기권');
  assert.equal(resolveForfeitStatusLabel(undefined), '기권');
  assert.equal(resolveForfeitStatusLabel(null), '기권');

  assert.equal(resolveForfeitProcessedLabel(true), '실격 처리됨');
  assert.equal(resolveForfeitProcessedLabel(undefined), '기권 처리됨');

  assert.equal(resolveOpponentForfeitTitle(true), '상대가 실격됐어요');
  assert.equal(resolveOpponentForfeitTitle(false), '상대가 기권했어요');
});

test('음성 한 줄: 이름 유무 × 실격 여부', () => {
  assert.equal(buildForfeiterAnnouncement('철수', false), '철수님이 기권했어요');
  assert.equal(buildForfeiterAnnouncement('철수', true), '철수님이 실격됐어요');
  assert.equal(buildForfeiterAnnouncement(null, undefined), '상대가 기권했어요');
  assert.equal(buildForfeiterAnnouncement(null, true), '상대가 실격됐어요');
});
