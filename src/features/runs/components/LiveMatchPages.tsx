import { memo } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Platform, ScrollView } from 'react-native';
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

type LiveMatchPagesProps = {
  scrollRef: RefObject<ScrollView | null>;
  page: number;
  pageWidth: number;
  hasResultPage: boolean;
  arenaProps: LiveMatchArenaPageProps;
  raceBoardProps: LiveMatchRaceBoardPageProps;
  trackingProps: LiveMatchTrackingPageProps;
  resultProps: LiveMatchResultPageProps;
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
  if (Platform.OS === 'android') {
    return (
      <LiveMatchPager
        scrollRef={scrollRef}
        page={page}
        pageWidth={pageWidth}
        hasResultPage={hasResultPage}
        arenaPage={page === 0 ? (
          <>
            <LiveMatchArenaPage {...arenaProps} />
            {exitAction}
          </>
        ) : null}
        raceBoardPage={page === 1 ? <LiveMatchRaceBoardPage {...raceBoardProps} /> : null}
        statsPage={page === 2 ? <LiveMatchTrackingPage {...trackingProps} /> : null}
        resultPage={hasResultPage && page === 3 ? <LiveMatchResultPage {...resultProps} /> : null}
        onPageChange={onPageChange}
      />
    );
  }

  return (
    <LiveMatchPager
      scrollRef={scrollRef}
      page={page}
      pageWidth={pageWidth}
      hasResultPage={hasResultPage}
      arenaPage={(
        <>
          <LiveMatchArenaPage {...arenaProps} />
          {exitAction}
        </>
      )}
      raceBoardPage={<LiveMatchRaceBoardPage {...raceBoardProps} />}
      statsPage={<LiveMatchTrackingPage {...trackingProps} />}
      resultPage={<LiveMatchResultPage {...resultProps} />}
      onPageChange={onPageChange}
    />
  );
});
