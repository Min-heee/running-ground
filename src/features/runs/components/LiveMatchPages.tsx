import { memo, useCallback } from 'react';
import type { ReactNode, RefObject } from 'react';
import { ScrollView } from 'react-native';
import {
  LiveMatchArenaPage,
  type LiveMatchArenaPageProps,
} from '@/features/runs/components/LiveMatchArenaPage';
import { LiveMatchPager } from '@/features/runs/components/LiveMatchPager';
import {
  LiveMatchRaceBoardPage,
  type LiveMatchRaceBoardPageProps,
} from '@/features/runs/components/LiveMatchRaceBoardPage';
import {
  LiveMatchResultPage,
  type LiveMatchResultPageProps,
} from '@/features/runs/components/LiveMatchResultPage';
import {
  LiveMatchTrackingPage,
  type LiveMatchTrackingPageProps,
} from '@/features/runs/components/LiveMatchTrackingPage';

export type LiveMatchPagesProps = {
  scrollRef: RefObject<ScrollView | null>;
  page: number;
  pageWidth: number;
  hasResultPage: boolean;
  arenaProps: LiveMatchArenaPageProps;
  raceBoardProps: LiveMatchRaceBoardPageProps | null;
  trackingProps: LiveMatchTrackingPageProps | null;
  resultProps: LiveMatchResultPageProps | null;
  exitAction: ReactNode;
  onPageChange: (page: number) => void;
};

export const LiveMatchPages = memo(function LiveMatchPages({
  scrollRef,
  page,
  pageWidth,
  hasResultPage,
  arenaProps,
  raceBoardProps,
  trackingProps,
  resultProps,
  exitAction,
  onPageChange,
}: LiveMatchPagesProps) {
  const renderArenaPage = useCallback(() => (
    <>
      <LiveMatchArenaPage {...arenaProps} />
      {exitAction}
    </>
  ), [arenaProps, exitAction]);

  const renderRaceBoardPage = useCallback(() => (
    raceBoardProps ? <LiveMatchRaceBoardPage {...raceBoardProps} /> : null
  ), [raceBoardProps]);

  const renderTrackingPage = useCallback(() => (
    trackingProps ? <LiveMatchTrackingPage {...trackingProps} /> : null
  ), [trackingProps]);

  const renderResultPage = useCallback(() => (
    resultProps ? <LiveMatchResultPage {...resultProps} /> : null
  ), [resultProps]);

  return (
    <LiveMatchPager
      scrollRef={scrollRef}
      page={page}
      pageWidth={pageWidth}
      hasResultPage={hasResultPage}
      renderArenaPage={renderArenaPage}
      renderRaceBoardPage={renderRaceBoardPage}
      renderStatsPage={renderTrackingPage}
      renderResultPage={renderResultPage}
      onPageChange={onPageChange}
    />
  );
}, (prevProps, nextProps) => {
  if (
    prevProps.scrollRef !== nextProps.scrollRef
    || prevProps.page !== nextProps.page
    || prevProps.pageWidth !== nextProps.pageWidth
    || prevProps.hasResultPage !== nextProps.hasResultPage
    || prevProps.onPageChange !== nextProps.onPageChange
  ) {
    return false;
  }

  if (nextProps.page === 1) {
    return prevProps.raceBoardProps === nextProps.raceBoardProps;
  }

  if (nextProps.page === 2) {
    return prevProps.trackingProps === nextProps.trackingProps;
  }

  if (nextProps.page === 3) {
    return prevProps.resultProps === nextProps.resultProps;
  }

  return (
    prevProps.arenaProps === nextProps.arenaProps
    && prevProps.exitAction === nextProps.exitAction
  );
});
