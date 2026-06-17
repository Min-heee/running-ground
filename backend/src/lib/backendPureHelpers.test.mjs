import assert from 'node:assert/strict';

import {
  buildExpirySnapshot,
  buildMatchSlotDateLabel,
  formatDuelSlotLabel,
  formatTimestamp,
} from './dateTimeFormatting.mjs';
import {
  buildLevelLabel,
  buildPaceBandLabel,
  buildProgressAveragePaceLabel,
  formatPaceMinutesLabel,
} from './matchFormatting.mjs';
import {
  buildDistanceRecommendationHint,
  calculateMatchCompatibilityScore,
  getMatchRoomMinParticipants,
  normalizeMatchQueueDistance,
  normalizeMatchRoomMaxParticipants,
  projectOfficialDistanceKm,
} from './matchPureHelpers.mjs';
import {
  MATCH_ROOM_GROUP_DEFAULT_PARTICIPANTS,
  MATCH_ROOM_GROUP_MAX_PARTICIPANTS,
  MATCH_ROOM_GROUP_MIN_PARTICIPANTS,
} from './matchConstants.mjs';
import {
  buildTestMatchQueueExpiresAt,
  buildTestMatchStartAt,
  getMatchBookingClosesAt,
} from './matchScheduleHelpers.mjs';

const fixedDate = new Date('2026-05-19T09:05:00.000Z');

assert.equal(formatTimestamp(fixedDate), '2026-05-19 18:05');
assert.equal(formatDuelSlotLabel('bad-date'), '시간대 미정');
assert.equal(formatDuelSlotLabel(fixedDate.toISOString()), '18:05');
assert.equal(buildMatchSlotDateLabel('bad-date'), '날짜 미정');
assert.deepEqual(buildExpirySnapshot('bad-date', fixedDate), {});
assert.deepEqual(buildExpirySnapshot(new Date(fixedDate.getTime() + 1500).toISOString(), fixedDate), {
  expiresAt: new Date(fixedDate.getTime() + 1500).toISOString(),
  expiresInSeconds: 2,
});

assert.equal(formatPaceMinutesLabel(5.5), '5:30/km');
assert.equal(buildPaceBandLabel(5.5), '5:20/km ~ 5:40/km');
assert.equal(buildLevelLabel(4), 'Lv.4');
assert.equal(buildProgressAveragePaceLabel(2, 600), '5:00/km');
assert.equal(buildProgressAveragePaceLabel(0, 600), '--:--/km');

assert.equal(buildTestMatchStartAt(fixedDate), new Date(fixedDate.getTime() + 30_000).toISOString());
assert.equal(buildTestMatchQueueExpiresAt(fixedDate), new Date(fixedDate.getTime() + 30 * 60 * 1000).toISOString());
assert.equal(getMatchBookingClosesAt(new Date(fixedDate.getTime() + 60 * 60 * 1000).toISOString()), new Date(fixedDate.getTime() + 30 * 60 * 1000).toISOString());

assert.equal(normalizeMatchQueueDistance(4.96), 5);
assert.equal(buildDistanceRecommendationHint(5), '');
assert.match(buildDistanceRecommendationHint(4.3), /추천 거리/);
assert.equal(projectOfficialDistanceKm(2, 600, 300, 5), 1);

assert.equal(calculateMatchCompatibilityScore(
  { averagePaceMinutes: 5, distanceLevel: 3, latestDistanceKm: 5, weeklyDistanceKm: 15 },
  { averagePaceMinutes: 5, distanceLevel: 3, latestDistanceKm: 5, weeklyDistanceKm: 15 },
  5,
  'duel',
), 100);

// A group party-run room must hold more than two runners.
assert.equal(MATCH_ROOM_GROUP_MIN_PARTICIPANTS > 2, true);

// Duel rooms always seat exactly two, regardless of the client value.
assert.equal(normalizeMatchRoomMaxParticipants('duel', 2), 2);
assert.equal(normalizeMatchRoomMaxParticipants('duel', 30), 2);
assert.equal(normalizeMatchRoomMaxParticipants('duel', undefined), 2);

// Group rooms keep a sensible explicit value and respect the upper bound 30.
assert.equal(normalizeMatchRoomMaxParticipants('group', 10), 10);
assert.equal(normalizeMatchRoomMaxParticipants('group', 10), MATCH_ROOM_GROUP_DEFAULT_PARTICIPANTS);
assert.equal(normalizeMatchRoomMaxParticipants('group', 30), 30);
assert.equal(normalizeMatchRoomMaxParticipants('group', 100), MATCH_ROOM_GROUP_MAX_PARTICIPANTS);
assert.equal(normalizeMatchRoomMaxParticipants('group', 5.4), 5);

// Safety net: a stale duel value of 2 (or anything below the group minimum)
// can never create a 2-person "group" — it is clamped up to the group floor.
assert.equal(normalizeMatchRoomMaxParticipants('group', 2), MATCH_ROOM_GROUP_MIN_PARTICIPANTS);
assert.equal(normalizeMatchRoomMaxParticipants('group', 1), MATCH_ROOM_GROUP_MIN_PARTICIPANTS);
assert.equal(normalizeMatchRoomMaxParticipants('group', '2'), MATCH_ROOM_GROUP_MIN_PARTICIPANTS);

// A missing/garbage group value falls back to the default capacity, never 2.
assert.equal(normalizeMatchRoomMaxParticipants('group', undefined), MATCH_ROOM_GROUP_DEFAULT_PARTICIPANTS);
assert.equal(normalizeMatchRoomMaxParticipants('group', 'not-a-number'), MATCH_ROOM_GROUP_DEFAULT_PARTICIPANTS);

assert.equal(getMatchRoomMinParticipants('duel'), 2);
assert.equal(getMatchRoomMinParticipants('group'), MATCH_ROOM_GROUP_MIN_PARTICIPANTS);
