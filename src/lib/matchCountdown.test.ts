import assert from 'node:assert/strict';
import test from 'node:test';

import { getMatchStartRemainingSeconds } from '@/lib/matchCountdown';

test('match start countdown rounds remaining milliseconds to reduce one-second device splits', () => {
  const slotStartAt = '2026-05-14T12:00:10.000Z';

  assert.equal(
    getMatchStartRemainingSeconds(slotStartAt, Date.parse('2026-05-14T12:00:03.400Z')),
    7,
  );
  assert.equal(
    getMatchStartRemainingSeconds(slotStartAt, Date.parse('2026-05-14T12:00:03.600Z')),
    6,
  );
});

test('match start countdown keeps the final visible second until the slot starts', () => {
  const slotStartAt = '2026-05-14T12:00:10.000Z';

  assert.equal(
    getMatchStartRemainingSeconds(slotStartAt, Date.parse('2026-05-14T12:00:09.800Z')),
    1,
  );
  assert.equal(
    getMatchStartRemainingSeconds(slotStartAt, Date.parse('2026-05-14T12:00:10.000Z')),
    null,
  );
});
