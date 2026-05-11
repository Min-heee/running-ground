import {
  connectedSources,
  createOfflineRaceHubMock,
  friendRanks,
  friendRequests,
  marketOverview,
  myNotificationSettings,
} from '@/data/mock';
import type {
  MarketRewardItem,
  OfflineRaceEvent,
  OfflineRaceHub,
} from '@/domain/types';
import type {
  RunningMatchRoom,
  RunningMatchStatusResponse,
} from '../../types';

export const mockMarketCatalog: Array<Omit<MarketRewardItem, 'claimState'>> = marketOverview.items.map(({ claimState, ...item }) => ({ ...item }));

export type MockOfflineRaceEventState = Omit<OfflineRaceEvent, 'registered' | 'status'> & {
  registeredUserTags: string[];
};

export type MockOfflineRaceHubState = Omit<OfflineRaceHub, 'featuredEvent' | 'upcomingEvents'> & {
  featuredEvent: MockOfflineRaceEventState;
  upcomingEvents: MockOfflineRaceEventState[];
};

export const initialOfflineRaceHub = createOfflineRaceHubMock();
export const initialFeaturedEvent = initialOfflineRaceHub.featuredEvent;

if (!initialFeaturedEvent) {
  throw new Error('Mock offline race hub requires a featured event.');
}

export const mockApiState = {
  friendRequests: friendRequests
    .filter((request) => request.status !== 'accepted')
    .map((request) => ({ ...request })),
  friendRanks: friendRanks.map((friend) => ({ ...friend })),
  connectedSources: connectedSources.map((source) => ({ ...source })),
  notificationPreferences: { ...myNotificationSettings },
  marketPoints: marketOverview.currentPoints,
  claimedMarketItemIds: new Set(
    marketOverview.items
      .filter((item) => item.claimState === 'claimed')
      .map((item) => item.id),
  ),
  offlineRaceHubState: {
    featuredEvent: {
      ...initialFeaturedEvent,
      registeredUserTags: [],
    },
    upcomingEvents: initialOfflineRaceHub.upcomingEvents.map((event) => ({
      ...event,
      registeredUserTags: [],
    })),
    pastEvents: initialOfflineRaceHub.pastEvents.map((event) => ({ ...event })),
    guideSteps: [...initialOfflineRaceHub.guideSteps],
  } as MockOfflineRaceHubState,
  runningMatchSessions: {
    duel: null,
    group: null,
  } as Record<'duel' | 'group', RunningMatchStatusResponse | null>,
  runningMatchRoom: null as RunningMatchRoom | null,
};
