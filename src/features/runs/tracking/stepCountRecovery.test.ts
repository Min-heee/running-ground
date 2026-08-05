import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveSaveTotalSteps } from './stepCountRecovery';

const START = '2026-08-05T21:08:00.000Z';
const END = '2026-08-05T21:42:38.000Z';

test('iOS: coprocessor query wins when it counted more steps than the live watch', async () => {
  const steps = await resolveSaveTotalSteps({
    watchedTotalSteps: 120,
    startIso: START,
    endIso: END,
    platformOs: 'ios',
    queryStepCount: async () => ({ steps: 4980 }),
  });
  assert.equal(steps, 4980);
});

test('iOS: smaller/invalid query results keep the live watch count', async () => {
  const base = { watchedTotalSteps: 5000, startIso: START, endIso: END, platformOs: 'ios' as const };
  assert.equal(await resolveSaveTotalSteps({ ...base, queryStepCount: async () => ({ steps: 300 }) }), 5000);
  assert.equal(await resolveSaveTotalSteps({ ...base, queryStepCount: async () => ({ steps: Number.NaN }) }), 5000);
  assert.equal(await resolveSaveTotalSteps({ ...base, queryStepCount: async () => null }), 5000);
});

test('iOS: query failure or bad timestamps fall back silently', async () => {
  assert.equal(await resolveSaveTotalSteps({
    watchedTotalSteps: 777,
    startIso: START,
    endIso: END,
    platformOs: 'ios',
    queryStepCount: async () => { throw new Error('denied'); },
  }), 777);
  assert.equal(await resolveSaveTotalSteps({
    watchedTotalSteps: 777,
    startIso: 'not-a-date',
    platformOs: 'ios',
    queryStepCount: async () => ({ steps: 9999 }),
  }), 777);
  // 종료가 시작보다 앞서는 손상 타임스탬프도 조용히 폴백.
  assert.equal(await resolveSaveTotalSteps({
    watchedTotalSteps: 777,
    startIso: END,
    endIso: START,
    platformOs: 'ios',
    queryStepCount: async () => ({ steps: 9999 }),
  }), 777);
});

test('Android and missing start keep the watch count without querying', async () => {
  let queried = false;
  const spyQuery = async () => { queried = true; return { steps: 9999 }; };
  assert.equal(await resolveSaveTotalSteps({
    watchedTotalSteps: 4200,
    startIso: START,
    endIso: END,
    platformOs: 'android',
    queryStepCount: spyQuery,
  }), 4200);
  assert.equal(await resolveSaveTotalSteps({
    watchedTotalSteps: 4200,
    startIso: null,
    platformOs: 'ios',
    queryStepCount: spyQuery,
  }), 4200);
  assert.equal(queried, false);
});
