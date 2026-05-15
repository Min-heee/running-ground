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
import { areLiveMatchPagesPropsEqualForActivePage } from '@/features/runs/components/liveMatchPager/liveMatchPagePropsComparator';

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
}, (prevProps, nextProps) => (
  areLiveMatchPagesPropsEqualForActivePage(prevProps, nextProps)
  && (
    nextProps.page === 0
      ? prevProps.exitAction === nextProps.exitAction
      : true
  )
));
