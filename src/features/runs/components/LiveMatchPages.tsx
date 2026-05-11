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

export function LiveMatchPages({
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
}
