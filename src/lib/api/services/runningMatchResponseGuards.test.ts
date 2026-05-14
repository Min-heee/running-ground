import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '@/services/apiError';
import {
  ensureRunningMatchStatusResponse,
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
