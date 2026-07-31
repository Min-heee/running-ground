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
