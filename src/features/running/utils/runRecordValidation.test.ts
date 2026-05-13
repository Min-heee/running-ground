import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeDistanceInput,
  validateManualRunInput,
} from './runRecordValidation';

test('manual run validation accepts normal inputs and normalizes distance and pace', () => {
  assert.equal(normalizeDistanceInput(' 5,25 '), '5.25');

  const result = validateManualRunInput({
    date: '2026-05-13',
    distanceKmText: ' 5,25 ',
    pace: ' 06:20/km ',
  });

  assert.deepEqual(result, {
    valid: true,
    value: {
      date: '2026-05-13',
      distanceKm: 5.25,
      pace: '06:20/km',
    },
  });
});

test('manual run validation rejects invalid date values without parsing them loosely', () => {
  assert.deepEqual(validateManualRunInput({
    date: '2026/05/13',
    distanceKmText: '5',
    pace: '06:20/km',
  }), {
    valid: false,
    message: '날짜는 YYYY-MM-DD 형식으로 입력해줘.',
  });
});

test('manual run validation rejects zero, negative, and non-finite distances', () => {
  for (const distanceKmText of ['0', '-1', 'Infinity', 'abc']) {
    assert.deepEqual(validateManualRunInput({
      date: '2026-05-13',
      distanceKmText,
      pace: '06:20/km',
    }), {
      valid: false,
      message: '거리는 0보다 큰 숫자로 입력해줘.',
    });
  }
});

test('manual run validation rejects malformed pace values', () => {
  assert.deepEqual(validateManualRunInput({
    date: '2026-05-13',
    distanceKmText: '5',
    pace: '6분20초',
  }), {
    valid: false,
    message: '페이스는 00:00/km 형식으로 입력해줘.',
  });
});
