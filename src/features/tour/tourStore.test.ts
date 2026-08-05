import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TOUR_STEPS } from './tourSteps';
import { getTourState, nextTourStep, startTour, stopTour, subscribeTour } from './tourStore';

test('tour store walks steps and auto-stops at the end', () => {
  let notified = 0;
  const unsubscribe = subscribeTour(() => { notified += 1; });

  try {
    startTour();
    assert.deepEqual(getTourState(), { active: true, stepIndex: 0 });

    for (let i = 1; i < TOUR_STEPS.length; i += 1) {
      nextTourStep();
      assert.deepEqual(getTourState(), { active: true, stepIndex: i });
    }

    // 마지막 스텝에서 다음 = 종료.
    nextTourStep();
    assert.deepEqual(getTourState(), { active: false, stepIndex: 0 });

    // 비활성 상태에서 next는 무시된다.
    nextTourStep();
    assert.deepEqual(getTourState(), { active: false, stepIndex: 0 });

    assert.ok(notified >= TOUR_STEPS.length + 1);
  } finally {
    stopTour();
    unsubscribe();
  }
});
