import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildVoiceOptionLabel } from './speechVoicePreference';

// 목소리 표시명 계약: 기기 이름이 있으면 그대로, identifier 만 있으면 사람이 읽을 수
// 있게 다듬는다 (com.apple.ttsbundle.Yuna-compact → Yuna).
test('voice option labels prefer device names and clean identifiers', () => {
  assert.equal(buildVoiceOptionLabel({ name: 'Yuna', identifier: 'com.apple.ttsbundle.Yuna-compact' }), 'Yuna');
  assert.equal(buildVoiceOptionLabel({ identifier: 'com.apple.ttsbundle.Yuna-compact' }), 'Yuna');
  assert.equal(buildVoiceOptionLabel({ identifier: 'com.apple.voice.enhanced.ko-KR.Yuna' }), 'Yuna');
  assert.equal(buildVoiceOptionLabel({ identifier: 'ko-kr-x-ism-network' }), 'ko kr x ism network');
  assert.equal(buildVoiceOptionLabel({}), '기기 음성');
});
