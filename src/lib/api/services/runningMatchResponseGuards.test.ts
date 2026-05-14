import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '@/services/apiError';
import {
  ensureRunningMatchProgressResponse,
  ensureRunningMatchStatusResponse,
  INVALID_MATCH_PROGRESS_RESPONSE_MESSAGE,
  INVALID_MATCH_STATUS_RESPONSE_MESSAGE,
} from './runningMatchResponseGuards';

const baseStatus = {
  acceptedCount: 2,
  capacity: 2,
  criteriaSummary: '테스트',
  distanceKm: 5,
  estimatedWaitMinutes: 0,
  levelBandLabel: 'Lv.1',
  matchId: 'match-1',
  mode: 'duel',
  paceBandLabel: '평균',
  participantCount: 2,
  readyToStart: true,
  slotLabel: '지금',
  slotStartAt: new Date().toISOString(),
  state: 'active',
  success: true,
  userAccepted: true,
} as const;

test('linked match status requires the expected match id', () => {
  assert.throws(
    () => ensureRunningMatchStatusResponse({
      ...baseStatus,
      matchId: undefined,
    }, {
      action: 'fetch-match-status',
      expectedMatchId: 'match-1',
      requireMatchId: true,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.userMessage, INVALID_MATCH_STATUS_RESPONSE_MESSAGE);
      assert.equal((error.details as { invalidReason?: string }).invalidReason, 'missingMatchId');
      return true;
    },
  );
});

test('linked match status rejects a mismatched match id', () => {
  assert.throws(
    () => ensureRunningMatchStatusResponse({
      ...baseStatus,
      matchId: 'other-match',
    }, {
      action: 'fetch-match-status',
      expectedMatchId: 'match-1',
    }),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal((error.details as { expectedMatchId?: string; invalidReason?: string }).expectedMatchId, 'match-1');
      assert.equal((error.details as { expectedMatchId?: string; invalidReason?: string }).invalidReason, 'mismatchedMatchId');
      return true;
    },
  );
});

test('match status guard accepts valid status payloads', () => {
  assert.equal(
    ensureRunningMatchStatusResponse(baseStatus, {
      action: 'fetch-match-status',
      expectedMatchId: 'match-1',
    }).matchId,
    'match-1',
  );
});

test('duel match status requires opponent user id when opponent is present', () => {
  assert.throws(
    () => ensureRunningMatchStatusResponse({
      ...baseStatus,
      opponent: {
        accepted: true,
        averagePace: '5:30/km',
        compatibilitySummary: '테스트',
        districtName: '일산서구',
        id: '',
        levelLabel: 'Lv.1',
        lifetimeDistanceKm: 100,
        name: '상대',
        weeklyDistanceKm: 10,
      },
    }, {
      action: 'fetch-match-status',
      expectedMatchId: 'match-1',
    }),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal((error.details as { invalidReason?: string }).invalidReason, 'missingOpponentUserId');
      return true;
    },
  );
});

test('group match status requires participant user ids', () => {
  assert.throws(
    () => ensureRunningMatchStatusResponse({
      ...baseStatus,
      mode: 'group',
      participants: [{
        accepted: true,
        averagePace: '5:30/km',
        districtName: '일산서구',
        id: '',
        lifetimeDistanceKm: 100,
        levelLabel: 'Lv.1',
        name: '참가자',
        seedRank: 1,
        seedSummary: '1번',
        weeklyDistanceKm: 10,
      }],
    }, {
      action: 'fetch-match-status',
      expectedMatchId: 'match-1',
    }),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal((error.details as { invalidReason?: string }).invalidReason, 'missingParticipantUserId');
      return true;
    },
  );
});

test('progress heartbeat response requires match id and uses progress user message', () => {
  assert.throws(
    () => ensureRunningMatchProgressResponse({
      ...baseStatus,
      matchId: undefined,
    }, {
      action: 'update-match-progress',
      expectedMatchId: 'match-1',
    }),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.userMessage, INVALID_MATCH_PROGRESS_RESPONSE_MESSAGE);
      assert.equal((error.details as { invalidReason?: string }).invalidReason, 'missingMatchId');
      return true;
    },
  );
});
