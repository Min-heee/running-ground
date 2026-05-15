import type { RefObject } from 'react';
import type { ScrollView } from 'react-native';
import type { LiveMatchArenaPageProps } from '@/features/runs/components/LiveMatchArenaPage';
import type { LiveMatchPagesProps } from '@/features/runs/components/LiveMatchPages';
import type { LiveMatchRaceBoardPageProps } from '@/features/runs/components/LiveMatchRaceBoardPage';
import type { LiveMatchResultPageProps } from '@/features/runs/components/LiveMatchResultPage';
import type { LiveMatchTrackingPageProps } from '@/features/runs/components/LiveMatchTrackingPage';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { LiveMatchArenaViewModel } from '@/features/runs/viewModels/liveMatchArenaViewModel';
import type { LiveMatchRaceBoardViewModel } from '@/features/runs/viewModels/liveMatchRaceBoardViewModel';

export function buildLiveMatchArenaPageProps({
  activeMatchId,
  arenaViewModel,
  onLiveMatchMounted,
}: {
  activeMatchId?: string | null;
  arenaViewModel: LiveMatchArenaViewModel | null;
  onLiveMatchMounted?: LiveMatchArenaPageProps['onLiveMatchMounted'];
}): LiveMatchArenaPageProps {
  return {
    stableMatchId: activeMatchId,
    viewModel: arenaViewModel,
    onLiveMatchMounted,
  };
}

export function buildLiveMatchRaceBoardPageProps({
  matchMode,
  raceBoardViewModel,
}: {
  matchMode: RunMatchMode;
  raceBoardViewModel: LiveMatchRaceBoardViewModel | null;
}): LiveMatchRaceBoardPageProps {
  return {
    matchMode,
    viewModel: raceBoardViewModel,
  };
}

export function buildLiveMatchResultPageProps({
  matchMode,
  estimatedBonusPoints,
  duelRows,
  groupRows,
  groupStatusLabel,
}: LiveMatchResultPageProps): LiveMatchResultPageProps {
  return {
    matchMode,
    estimatedBonusPoints,
    duelRows,
    groupRows,
    groupStatusLabel,
  };
}

export function buildLiveMatchStatsPageProps({
  page,
  trackingPageProps,
}: {
  page: number;
  trackingPageProps: Omit<LiveMatchTrackingPageProps, 'includeMatchCards'>;
}): LiveMatchTrackingPageProps | null {
  return page === 2 ? { ...trackingPageProps, includeMatchCards: false } : null;
}

export function buildLiveMatchPagesProps({
  scrollRef,
  page,
  pageWidth,
  hasResultPage,
  arenaProps,
  raceBoardProps,
  trackingStatsPageProps,
  resultProps,
  onPageChange,
}: {
  scrollRef: RefObject<ScrollView | null>;
  page: number;
  pageWidth: number;
  hasResultPage: boolean;
  arenaProps: LiveMatchArenaPageProps;
  raceBoardProps: LiveMatchRaceBoardPageProps;
  trackingStatsPageProps: LiveMatchTrackingPageProps | null;
  resultProps: LiveMatchResultPageProps;
  onPageChange: (page: number) => void;
}): Omit<LiveMatchPagesProps, 'exitAction'> {
  return {
    scrollRef,
    page,
    pageWidth,
    hasResultPage,
    arenaProps,
    raceBoardProps: page === 1 ? raceBoardProps : null,
    trackingProps: trackingStatsPageProps,
    resultProps: page === 3 ? resultProps : null,
    onPageChange,
  };
}
