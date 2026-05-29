export type LiveMatchPageComparableProps = {
  arenaProps: unknown;
  hasResultPage: boolean;
  onPageChange: unknown;
  page: number;
  pageWidth: number;
  raceBoardProps: unknown;
  resultProps: unknown;
  scrollRef: unknown;
  trackingProps: unknown;
};

export type LiveMatchContainerComparableProps = {
  exitAction: unknown;
  isPaused: boolean;
  isRunningSolo: boolean;
  isSaving: boolean;
  livePagesProps: LiveMatchPageComparableProps;
  onDiscardTracking: unknown;
  onPauseTracking: unknown;
  onResumeTracking: unknown;
  onSaveTracking: unknown;
  showLiveArena: boolean;
  trackingPageProps: unknown;
};

export function shouldShowPausedTrackingActions({
  isPaused,
  showLiveArena,
}: {
  hasResultPage: boolean;
  isPaused: boolean;
  showLiveArena: boolean;
}) {
  return isPaused && !showLiveArena;
}

export function doesLiveMatchPageUseExitAction(page: number): boolean {
  return page === 0;
}

export function areLiveMatchPagesPropsEqualForActivePage(
  prevProps: LiveMatchPageComparableProps,
  nextProps: LiveMatchPageComparableProps,
): boolean {
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

  return prevProps.arenaProps === nextProps.arenaProps;
}

export function areLiveMatchContainerPropsEqual(
  prevProps: LiveMatchContainerComparableProps,
  nextProps: LiveMatchContainerComparableProps,
): boolean {
  if (
    prevProps.showLiveArena !== nextProps.showLiveArena
    || prevProps.isSaving !== nextProps.isSaving
    || prevProps.isRunningSolo !== nextProps.isRunningSolo
    || prevProps.isPaused !== nextProps.isPaused
    || prevProps.onSaveTracking !== nextProps.onSaveTracking
    || prevProps.onPauseTracking !== nextProps.onPauseTracking
    || prevProps.onResumeTracking !== nextProps.onResumeTracking
    || prevProps.onDiscardTracking !== nextProps.onDiscardTracking
  ) {
    return false;
  }

  if (!nextProps.showLiveArena) {
    return prevProps.trackingPageProps === nextProps.trackingPageProps;
  }

  if (!areLiveMatchPagesPropsEqualForActivePage(prevProps.livePagesProps, nextProps.livePagesProps)) {
    return false;
  }

  return doesLiveMatchPageUseExitAction(nextProps.livePagesProps.page)
    ? prevProps.exitAction === nextProps.exitAction
    : true;
}
