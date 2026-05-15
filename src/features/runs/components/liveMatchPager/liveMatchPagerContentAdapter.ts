import {
  EMPTY_PAGE_RENDERER,
} from '@/features/runs/components/liveMatchPager/LiveMatchPagerPageSlot';
import type { LiveMatchPageRenderer } from '@/features/runs/components/liveMatchPager/types';

export type LiveMatchPagerContentAdapterInput = {
  page: number;
  hasResultPage: boolean;
  renderArenaPage: LiveMatchPageRenderer;
  renderRaceBoardPage: LiveMatchPageRenderer;
  renderStatsPage: LiveMatchPageRenderer;
  renderResultPage?: LiveMatchPageRenderer;
};

export function resolveLiveMatchPageRenderer({
  page,
  hasResultPage,
  renderArenaPage,
  renderRaceBoardPage,
  renderStatsPage,
  renderResultPage,
}: LiveMatchPagerContentAdapterInput) {
  if (page === 1) {
    return renderRaceBoardPage;
  }

  if (page === 2) {
    return renderStatsPage;
  }

  if (page === 3 && hasResultPage) {
    return renderResultPage ?? EMPTY_PAGE_RENDERER;
  }

  return renderArenaPage;
}

export function shouldRenderLiveMatchScrollPage({
  index,
  page,
  hasResultPage,
}: {
  index: number;
  page: number;
  hasResultPage: boolean;
}) {
  if (index === 3) {
    return hasResultPage && page === 3;
  }

  return page === index;
}
