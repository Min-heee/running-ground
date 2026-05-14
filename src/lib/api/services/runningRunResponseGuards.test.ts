import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '@/services/apiError';
import {
  ensureRunDetailResponse,
  ensureRunSaveResponse,
  INVALID_RUN_SAVE_RESPONSE_MESSAGE,
} from './runningRunResponseGuards';

const baseRunDetail = {
  earnedPoint: 10,
  estimatedMinutes: 28,
  pointBreakdown: {
    growthPoints: 0,
    levelPoints: 10,
    matchBonusPoints: 0,
    streakPoints: 0,
    totalPoints: 10,
  },
  run: {
    date: '2026-05-14',
    distanceKm: 5,
    id: 'run-1',
    pace: '5:30/km',
    source: 'RunningGround',
  },
  weeklyDistanceKm: 5,
} as const;

test('run detail response requires run id', () => {
  assert.throws(
    () => ensureRunDetailResponse({
      ...baseRunDetail,
      run: {
        ...baseRunDetail.run,
        id: '',
      },
    }, { action: 'fetch-run-detail' }),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal((error.details as { code?: string; invalidReason?: string }).code, 'invalid_run_response');
      assert.equal((error.details as { code?: string; invalidReason?: string }).invalidReason, 'missingRunId');
      return true;
    },
  );
});

test('run save response uses save-specific user message', () => {
  assert.throws(
    () => ensureRunSaveResponse({
      ...baseRunDetail,
      pointBreakdown: {
        ...baseRunDetail.pointBreakdown,
        totalPoints: Number.NaN,
      },
    }, { action: 'create-tracked-run' }),
    (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.userMessage, INVALID_RUN_SAVE_RESPONSE_MESSAGE);
      assert.equal((error.details as { invalidReason?: string }).invalidReason, 'missingPointBreakdownTotal');
      return true;
    },
  );
});

test('run detail response accepts complete payloads', () => {
  assert.equal(
    ensureRunDetailResponse(baseRunDetail, { action: 'fetch-run-detail' }).run.id,
    'run-1',
  );
});
