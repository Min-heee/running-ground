import type { RefObject } from 'react';
import type { ScrollView } from 'react-native';
import type { LiveMatchArenaPageProps } from '@/features/runs/components/LiveMatchArenaPage';
import type { LiveMatchPagesProps } from '@/features/runs/components/LiveMatchPages';
import type { LiveMatchRaceBoardPageProps } from '@/features/runs/components/LiveMatchRaceBoardPage';
import type { LiveMatchResultPageProps } from '@/features/runs/components/LiveMatchResultPage';
import type { LiveMatchTrackingPageProps } from '@/features/runs/components/LiveMatchTrackingPage';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { LiveMatchArenaViewModel } from '@/features/runs/viewModels/liveMatchArenaViewModel';
import {
  buildLiveMatchRaceBoardViewModel,
  type LiveMatchRaceBoardViewModel,
  type LiveMatchRaceBoardViewModelInput,
} from '@/features/runs/viewModels/liveMatchRaceBoardViewModel';

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
  estimatedLpDelta,
  duelRows,
  groupRows,
  groupStatusLabel,
}: LiveMatchResultPageProps): LiveMatchResultPageProps {
  return {
    matchMode,
    estimatedBonusPoints,
    estimatedLpDelta,
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
  trackingPageProps: Omit<LiveMatchTrackingPageProps, 'includeMatchCards'> | null;
}): LiveMatchTrackingPageProps | null {
  return page === 2 && trackingPageProps ? { ...trackingPageProps, includeMatchCards: false } : null;
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
  resultProps: LiveMatchResultPageProps | null;
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
    resultProps: hasResultPage || page === 3 ? resultProps : null,
    onPageChange,
  };
}

export function buildLiveMatchRaceBoardViewModelForPage({
  page,
  input,
}: {
  page: number;
  input: LiveMatchRaceBoardViewModelInput;
}) {
  return page === 1 ? buildLiveMatchRaceBoardViewModel(input) : null;
}

export function buildLiveMatchResultPagePropsForPage({
  hasResultPage = false,
  page,
  resultPageProps,
}: {
  hasResultPage?: boolean;
  page: number;
  resultPageProps: LiveMatchResultPageProps | null;
}) {
  return (hasResultPage || page === 3) && resultPageProps ? buildLiveMatchResultPageProps(resultPageProps) : null;
}

export function buildLiveMatchPageViewModels({
  scrollRef,
  page,
  pageWidth,
  hasResultPage,
  activeMatchId,
  arenaViewModel,
  onLiveMatchMounted,
  matchMode,
  raceBoardViewModel,
  trackingPageProps,
  resultPageProps,
  onPageChange,
}: {
  scrollRef: RefObject<ScrollView | null>;
  page: number;
  pageWidth: number;
  hasResultPage: boolean;
  activeMatchId?: string | null;
  arenaViewModel: LiveMatchArenaViewModel | null;
  onLiveMatchMounted?: LiveMatchArenaPageProps['onLiveMatchMounted'];
  matchMode: RunMatchMode;
  raceBoardViewModel: LiveMatchRaceBoardViewModel | null;
  trackingPageProps: Omit<LiveMatchTrackingPageProps, 'includeMatchCards'>;
  resultPageProps: LiveMatchResultPageProps;
  onPageChange: (page: number) => void;
}) {
  const arenaProps = buildLiveMatchArenaPageProps({
    activeMatchId,
    arenaViewModel,
    onLiveMatchMounted,
  });
  const raceBoardProps = buildLiveMatchRaceBoardPageProps({
    matchMode,
    raceBoardViewModel,
  });
  const trackingStatsPageProps = buildLiveMatchStatsPageProps({
    page,
    trackingPageProps,
  });
  const resultProps = buildLiveMatchResultPagePropsForPage({
    hasResultPage,
    page,
    resultPageProps,
  });

  return {
    arenaProps,
    raceBoardProps,
    trackingStatsPageProps,
    resultProps,
    livePagesProps: buildLiveMatchPagesProps({
      scrollRef,
      page,
      pageWidth,
      hasResultPage,
      arenaProps,
      raceBoardProps,
      trackingStatsPageProps,
      resultProps,
      onPageChange,
    }),
  };
}
