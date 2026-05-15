import { memo, useCallback, useMemo } from 'react';
import type { RefObject } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, Platform, ScrollView, Text, View } from 'react-native';
import {
  EMPTY_PAGE_RENDERER,
  LiveMatchPagerPageSlot,
} from '@/features/runs/components/liveMatchPager/LiveMatchPagerPageSlot';
import {
  resolveLiveMatchPageRenderer,
  shouldRenderLiveMatchScrollPage,
} from '@/features/runs/components/liveMatchPager/liveMatchPagerContentAdapter';
import { liveMatchPagerStyles as styles } from '@/features/runs/components/liveMatchPager/styles';
import { LiveMatchPagerTabs } from '@/features/runs/components/liveMatchPager/LiveMatchPagerTabs';
import type { LiveMatchPageRenderer } from '@/features/runs/components/liveMatchPager/types';
import { useDevRenderCounter } from '@/utils/useDevRenderCounter';

type LiveMatchPagerProps = {
  scrollRef: RefObject<ScrollView | null>;
  page: number;
  pageWidth: number;
  hasResultPage: boolean;
  renderArenaPage: LiveMatchPageRenderer;
  renderRaceBoardPage: LiveMatchPageRenderer;
  renderStatsPage: LiveMatchPageRenderer;
  renderResultPage?: LiveMatchPageRenderer;
  onPageChange: (page: number) => void;
};

export const LiveMatchPager = memo(function LiveMatchPager({
  scrollRef,
  page,
  pageWidth,
  hasResultPage,
  renderArenaPage,
  renderRaceBoardPage,
  renderStatsPage,
  renderResultPage,
  onPageChange,
}: LiveMatchPagerProps) {
  useDevRenderCounter(`LiveMatchPager:page-${page}`);
  const pageStyle = useMemo(() => [styles.page, { width: pageWidth }], [pageWidth]);

  const shouldRenderScrollPage = useCallback((index: number) => {
    return shouldRenderLiveMatchScrollPage({ index, page, hasResultPage });
  }, [hasResultPage, page]);

  const activePageRenderer = useMemo(() => (
    resolveLiveMatchPageRenderer({
      page,
      hasResultPage,
      renderArenaPage,
      renderRaceBoardPage,
      renderStatsPage,
      renderResultPage,
    })
  ), [
    hasResultPage,
    page,
    renderArenaPage,
    renderRaceBoardPage,
    renderResultPage,
    renderStatsPage,
  ]);

  const handleMomentumEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pageWidth <= 0) {
      return;
    }
    onPageChange(Math.round(event.nativeEvent.contentOffset.x / pageWidth));
  }, [onPageChange, pageWidth]);

  const handleTabPress = useCallback((index: number) => {
    if (Platform.OS === 'android') {
      onPageChange(index);
      return;
    }

    scrollRef.current?.scrollTo({ x: pageWidth * index, animated: true });
    onPageChange(index);
  }, [onPageChange, pageWidth, scrollRef]);

  if (Platform.OS === 'android') {
    return (
      <View style={styles.shell}>
        <LiveMatchPagerTabs
          page={page}
          hasResultPage={hasResultPage}
          onTabPress={handleTabPress}
        />
        <View style={styles.androidPage}>
          {activePageRenderer()}
        </View>
        <Text style={styles.hint}>위 탭을 누르면 순위와 기록 화면을 볼 수 있어요.</Text>
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      <LiveMatchPagerTabs
        page={page}
        hasResultPage={hasResultPage}
        onTabPress={handleTabPress}
      />
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        directionalLockEnabled
        nestedScrollEnabled
        overScrollMode="never"
        removeClippedSubviews={false}
        scrollEventThrottle={32}
        onMomentumScrollEnd={handleMomentumEnd}
      >
        <LiveMatchPagerPageSlot
          shouldRender={shouldRenderScrollPage(0)}
          pageStyle={pageStyle}
          renderPage={renderArenaPage}
        />
        <LiveMatchPagerPageSlot
          shouldRender={shouldRenderScrollPage(1)}
          pageStyle={pageStyle}
          renderPage={renderRaceBoardPage}
        />
        <LiveMatchPagerPageSlot
          shouldRender={shouldRenderScrollPage(2)}
          pageStyle={pageStyle}
          renderPage={renderStatsPage}
        />
        {hasResultPage ? (
          <LiveMatchPagerPageSlot
            shouldRender={shouldRenderScrollPage(3)}
            pageStyle={pageStyle}
            renderPage={renderResultPage ?? EMPTY_PAGE_RENDERER}
          />
        ) : null}
      </ScrollView>
      <Text style={styles.hint}>
        {hasResultPage
          ? '옆으로 넘기면 순위, 기록, 결과 화면을 볼 수 있어요.'
          : '옆으로 넘기면 순위와 기록 화면을 볼 수 있어요.'}
      </Text>
    </View>
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
    return prevProps.renderRaceBoardPage === nextProps.renderRaceBoardPage;
  }

  if (nextProps.page === 2) {
    return prevProps.renderStatsPage === nextProps.renderStatsPage;
  }

  if (nextProps.page === 3) {
    return prevProps.renderResultPage === nextProps.renderResultPage;
  }

  return prevProps.renderArenaPage === nextProps.renderArenaPage;
});
