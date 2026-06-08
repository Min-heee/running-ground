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
} from '@/domain';
import type {
  InboxNotification,
  RunningMatchRoom,
  RunningMatchStatusResponse,
} from '../../types';

export const mockMarketCatalog: Omit<MarketRewardItem, 'claimState'>[] = marketOverview.items.map(({ claimState, ...item }) => ({ ...item }));

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
  inboxNotifications: [
    {
      id: 'mock-notification-1',
      userId: 'mock-user',
      type: 'match_invite',
      title: '파티런 초대',
      body: '민지님이 1대1 파티런에 초대했어요.',
      data: { roomId: 'mock-room-1' },
      createdAt: '2026-06-08T02:30:00.000Z',
      readAt: null,
    },
    {
      id: 'mock-notification-2',
      userId: 'mock-user',
      type: 'rank_change',
      title: '랭크 LP 변동',
      body: '대결 결과로 랭크 +20 LP가 반영됐어요.',
      data: { tier: '러너', lpDelta: 20 },
      createdAt: '2026-06-07T12:00:00.000Z',
      readAt: '2026-06-07T12:10:00.000Z',
    },
  ] as InboxNotification[],
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
