import assert from 'node:assert/strict';
import test from 'node:test';
import {
  areLiveMatchContainerPropsEqual,
  areLiveMatchPagesPropsEqualForActivePage,
} from '@/features/runs/components/liveMatchPager/liveMatchPagePropsComparator';

const noop = () => {};
const scrollRef = { current: null };

function buildPagesProps(overrides = {}) {
  return {
    scrollRef,
    page: 0,
    pageWidth: 360,
    hasResultPage: true,
    arenaProps: { id: 'arena-a' },
    raceBoardProps: { id: 'race-a' },
    trackingProps: { id: 'tracking-a' },
    resultProps: { id: 'result-a' },
    onPageChange: noop,
    ...overrides,
  };
}

function buildContainerProps(overrides = {}) {
  return {
    showLiveArena: true,
    livePagesProps: buildPagesProps(),
    trackingPageProps: { id: 'hidden-tracking-a' },
    exitAction: { id: 'exit-a' },
    isSaving: false,
    isRunningSolo: false,
    isPaused: false,
    onSaveTracking: noop,
    onPauseTracking: noop,
    onResumeTracking: noop,
    onDiscardTracking: noop,
    ...overrides,
  };
}

test('live match active page comparator ignores inactive page prop churn', () => {
  const raceBoardProps = { id: 'race-a' };

  assert.equal(areLiveMatchPagesPropsEqualForActivePage(
    buildPagesProps({ page: 1, raceBoardProps }),
    buildPagesProps({
      page: 1,
      arenaProps: { id: 'arena-b' },
      raceBoardProps,
      trackingProps: { id: 'tracking-b' },
      resultProps: { id: 'result-b' },
    }),
  ), true);

  assert.equal(areLiveMatchPagesPropsEqualForActivePage(
    buildPagesProps({ page: 1 }),
    buildPagesProps({
      page: 1,
      raceBoardProps: { id: 'race-b' },
    }),
  ), false);
});

test('live match container ignores exit action churn away from arena page', () => {
  const raceBoardProps = { id: 'race-a' };
  const rankingProps = buildPagesProps({ page: 1, raceBoardProps });

  assert.equal(areLiveMatchContainerPropsEqual(
    buildContainerProps({ livePagesProps: rankingProps }),
    buildContainerProps({
      livePagesProps: buildPagesProps({
        page: 1,
        arenaProps: { id: 'arena-b' },
        raceBoardProps: rankingProps.raceBoardProps,
      }),
      exitAction: { id: 'exit-b' },
    }),
  ), true);

  assert.equal(areLiveMatchContainerPropsEqual(
    buildContainerProps({ livePagesProps: buildPagesProps({ page: 0 }) }),
    buildContainerProps({
      livePagesProps: buildPagesProps({ page: 0 }),
      exitAction: { id: 'exit-b' },
    }),
  ), false);
});
