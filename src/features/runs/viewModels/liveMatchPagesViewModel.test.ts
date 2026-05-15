import assert from 'node:assert/strict';
import test from 'node:test';
import type { LiveMatchResultPageProps } from '@/features/runs/components/LiveMatchResultPage';
import type { LiveMatchTrackingViewProps } from '@/features/runs/viewModels/liveMatchTrackingViewModel';
import {
  buildLiveMatchPageViewModels,
  buildLiveMatchRaceBoardViewModelForPage,
  buildLiveMatchResultPagePropsForPage,
  buildLiveMatchStatsPageProps,
} from './liveMatchPagesViewModel';
import type { LiveMatchRaceBoardViewModelInput } from './liveMatchRaceBoardViewModel';

const noop = () => {};

const baseRaceBoardInput: LiveMatchRaceBoardViewModelInput = {
  matchMode: 'duel',
  effectiveDuelOpponent: null,
  duelLiveGapKm: null,
  duelDistanceKm: 5,
  groupDistanceKm: 5,
  distanceKm: 1,
  syncedDuelDistanceKm: 1,
  syncedDuelOpponentDistanceKm: 0,
  currentUserDuelLiveStatus: null,
  currentUserGroupLiveStatus: null,
  roomLinkedDuelPlaceholderParticipants: [],
  roomLinkedGroupPlaceholderParticipants: [],
  visibleMatchRoom: null,
  groupLiveStandings: [],
  currentUserArenaPace: '05:30/km',
  groupArenaUsesLivePace: false,
};

const trackingPageProps: LiveMatchTrackingViewProps = {
  matchMode: 'duel',
  liveMatchTitle: '대결',
  liveMatchText: '진행 중',
  effectiveDuelOpponent: null,
  duelDistanceKm: 5,
  duelLiveTitle: '동기화 중',
  duelLiveSummary: '거리 비교 중',
  duelStatusAlert: null,
  distanceKm: 1,
  isLeavingDuelMatch: false,
  effectiveGroupParticipantCount: 0,
  currentGroupStanding: null,
  groupAheadParticipant: null,
  groupBehindParticipant: null,
  groupStatusAlert: null,
  isLeavingGroupMatch: false,
  groupLiveStandings: [],
  currentGroupLeader: null,
  elapsedSeconds: 300,
  averagePace: '05:30/km',
  currentPace: '05:20/km',
  cadenceSpm: null,
  elevationGainM: 0,
  metricLabels: {
    elapsedLabel: '05:00',
    distanceLabel: '1.00 km',
    averagePaceLabel: '05:30/km',
    currentPaceLabel: '05:20/km',
    cadenceLabel: '-',
    elevationLabel: '0 m',
  },
  onContinueSoloFromMatch: noop,
};

const resultPageProps: LiveMatchResultPageProps = {
  matchMode: 'duel',
  estimatedBonusPoints: 10,
  duelRows: [],
  groupRows: [],
  groupStatusLabel: '완료',
};

test('race board view model is only built for the ranking page', () => {
  assert.equal(buildLiveMatchRaceBoardViewModelForPage({
    page: 0,
    input: baseRaceBoardInput,
  }), null);
  assert.equal(buildLiveMatchRaceBoardViewModelForPage({
    page: 1,
    input: baseRaceBoardInput,
  })?.title, '1대1 레이스 보드');
});

test('tracking and result page props are only built for selected heavy pages', () => {
  assert.equal(buildLiveMatchStatsPageProps({
    page: 0,
    trackingPageProps,
  }), null);
  assert.equal(buildLiveMatchStatsPageProps({
    page: 1,
    trackingPageProps,
  }), null);
  assert.equal(buildLiveMatchStatsPageProps({
    page: 2,
    trackingPageProps,
  })?.includeMatchCards, false);
  assert.equal(buildLiveMatchResultPagePropsForPage({
    page: 0,
    resultPageProps,
  }), null);
  assert.equal(buildLiveMatchResultPagePropsForPage({
    page: 3,
    resultPageProps,
  })?.estimatedBonusPoints, 10);
});

test('page view model builder gates heavy page props by selected page', () => {
  const pageZeroModels = buildLiveMatchPageViewModels({
    scrollRef: { current: null },
    page: 0,
    pageWidth: 360,
    hasResultPage: true,
    activeMatchId: 'match-1',
    arenaViewModel: null,
    onLiveMatchMounted: undefined,
    matchMode: 'duel',
    raceBoardViewModel: null,
    trackingPageProps,
    resultPageProps,
    onPageChange: noop,
  });

  assert.equal(pageZeroModels.livePagesProps.raceBoardProps, null);
  assert.equal(pageZeroModels.livePagesProps.trackingProps, null);
  assert.equal(pageZeroModels.livePagesProps.resultProps, null);
  assert.equal(pageZeroModels.livePagesProps.arenaProps.stableMatchId, 'match-1');

  const pageTwoModels = buildLiveMatchPageViewModels({
    scrollRef: { current: null },
    page: 2,
    pageWidth: 360,
    hasResultPage: true,
    activeMatchId: 'match-1',
    arenaViewModel: null,
    onLiveMatchMounted: undefined,
    matchMode: 'duel',
    raceBoardViewModel: null,
    trackingPageProps,
    resultPageProps,
    onPageChange: noop,
  });

  assert.equal(pageTwoModels.livePagesProps.raceBoardProps, null);
  assert.equal(pageTwoModels.livePagesProps.resultProps, null);
  assert.equal(pageTwoModels.livePagesProps.trackingProps?.includeMatchCards, false);

  const pageThreeModels = buildLiveMatchPageViewModels({
    scrollRef: { current: null },
    page: 3,
    pageWidth: 360,
    hasResultPage: true,
    activeMatchId: 'match-1',
    arenaViewModel: null,
    onLiveMatchMounted: undefined,
    matchMode: 'duel',
    raceBoardViewModel: null,
    trackingPageProps,
    resultPageProps,
    onPageChange: noop,
  });

  assert.equal(pageThreeModels.livePagesProps.trackingProps, null);
  assert.equal(pageThreeModels.livePagesProps.resultProps?.estimatedBonusPoints, 10);
});
