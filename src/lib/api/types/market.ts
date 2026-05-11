import type {
  MarketOverview,
  OfflineRaceEvent,
  OfflineRaceHub,
} from '@/domain/types';

export type MarketOverviewResponse = MarketOverview;
export type OfflineRaceHubResponse = OfflineRaceHub;

export type MarketClaimResponse = {
  success: boolean;
  claimedItemId: string;
  overview: MarketOverview;
};

export type OfflineRaceEntryActionResponse = {
  success: boolean;
  event: OfflineRaceEvent;
};
