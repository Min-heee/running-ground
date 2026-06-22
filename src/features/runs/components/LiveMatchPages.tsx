import { memo, useCallback } from 'react';
import type { ReactNode, RefObject } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
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
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import { spacing } from '@/theme/tokens';

export type LiveMatchPagesProps = {
  scrollRef: RefObject<ScrollView | null>;
  page: number;
  pageWidth: number;
  hasResultPage: boolean;
  matchMode: RunMatchMode;
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
  matchMode,
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

  if (hasResultPage && resultProps) {
    return (
      <ScrollView
        style={styles.standaloneResultScroll}
        contentContainerStyle={styles.standaloneResult}
        showsVerticalScrollIndicator={false}
      >
        <LiveMatchResultPage {...resultProps} />
        {exitAction}
      </ScrollView>
    );
  }

  return (
    <LiveMatchPager
      scrollRef={scrollRef}
      page={page}
      pageWidth={pageWidth}
      hasResultPage={false}
      matchMode={matchMode}
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
    nextProps.hasResultPage
      ? prevProps.resultProps === nextProps.resultProps && prevProps.exitAction === nextProps.exitAction
      : (
        nextProps.page === 0
          ? prevProps.exitAction === nextProps.exitAction
          : true
      )
  )
));

const styles = StyleSheet.create({
  standaloneResultScroll: {
    flex: 1,
  },
  standaloneResult: {
    flexGrow: 1,
    gap: spacing.s16,
    paddingHorizontal: spacing.s16,
    paddingTop: spacing.s16,
  },
});
