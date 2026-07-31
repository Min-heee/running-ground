import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCheerSpeech } from './speakCheers';

test('응원 여러 개는 문장 하나로 합친다 — TTS가 이전 발화를 끊기 때문', () => {
  const speech = buildCheerSpeech([
    { id: 'c1', fromName: '회원G', message: '힘내!' },
    { id: 'c2', fromName: '회원C', message: '거의 다 왔어!' },
  ]);

  assert.equal(speech, '회원G님의 응원. 힘내! 회원C님의 응원. 거의 다 왔어!');
});

test('빈 목록/망가진 항목은 null', () => {
  assert.equal(buildCheerSpeech([]), null);
  assert.equal(buildCheerSpeech([{ id: 'c', fromName: '', message: 'x' } as never]), null);
});

test('응원이 많이 몰리면 3개까지만 원문, 나머지는 요약한다', () => {
  const cheers = Array.from({ length: 7 }, (unused, index) => ({
    id: `c${index}`, fromName: `친구${index}`, message: '힘내!',
  }));

  const speech = buildCheerSpeech(cheers);
  assert.ok(speech?.endsWith('외 4명이 응원했어요.'), speech ?? 'null');
  assert.equal((speech?.match(/님의 응원/g) ?? []).length, 3);
});
