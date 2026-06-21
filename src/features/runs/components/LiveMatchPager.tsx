import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { RefObject } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, Platform, ScrollView, Text, View } from 'react-native';
import {
  EMPTY_PAGE_RENDERER,
  LiveMatchPagerPageSlot,
} from '@/features/runs/components/liveMatchPager/LiveMatchPagerPageSlot';
import { resolveSyncedActiveTab } from '@/features/runs/components/liveMatchPager/liveMatchPagerActiveTab';
import {
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

  // LOCAL active-tab index drives the tab highlight so it never waits on the
  // JS-thread-saturated parent re-render (Android defers the heavy page-content
  // commit via startTransition). A tab press sets this SYNCHRONOUSLY for instant
  // highlight movement; the effect below snaps it back onto the real `page` prop
  // for any EXTERNAL change (auto-switch to 결과 보기 on finish, an iOS swipe, or
  // a remount) so the local value can never permanently strand out of sync.
  const [activeTab, setActiveTab] = useState(page);

  useEffect(() => {
    setActiveTab((current) => resolveSyncedActiveTab(current, page));
  }, [page]);

  const shouldRenderScrollPage = useCallback((index: number) => {
    return shouldRenderLiveMatchScrollPage({ index, page, hasResultPage });
  }, [hasResultPage, page]);

  const handleMomentumEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pageWidth <= 0) {
      return;
    }
    onPageChange(Math.round(event.nativeEvent.contentOffset.x / pageWidth));
  }, [onPageChange, pageWidth]);

  const handleTabPress = useCallback((index: number) => {
    // Move the highlight instantly off local state, before the (possibly
    // deferred) page-content commit lands, so the tap always reads as responsive.
    setActiveTab(index);

    if (Platform.OS === 'android') {
      // Commit the page change SYNCHRONOUSLY. A startTransition here gets starved
      // by the constant live-match re-renders (GPS/timer), so the deferred page
      // commit never lands — only the highlight moved while the CONTENT stayed put.
      // Android content now renders off the local activeTab below (instant swap),
      // and this keeps the parent's `page` in lockstep so the memo + external
      // auto-switch stay consistent.
      onPageChange(index);
      return;
    }

    // iOS keeps every page mounted in the paging ScrollView, so the scroll and
    // the page-index commit both stay synchronous — deferring the commit here
    // would let the ScrollView scroll to a still-conditionally-empty page.
    scrollRef.current?.scrollTo({ x: pageWidth * index, animated: true });
    onPageChange(index);
  }, [onPageChange, pageWidth, scrollRef]);

  if (Platform.OS === 'android') {
    return (
      <View style={styles.shell}>
        <LiveMatchPagerTabs
          activeTab={activeTab}
          hasResultPage={hasResultPage}
          onTabPress={handleTabPress}
        />
        <View style={styles.androidPage}>
          <View style={activeTab === 0 ? styles.androidPageSlot : styles.androidPageHiddenSlot}>
            {activeTab === 0 ? renderArenaPage() : null}
          </View>
          <View style={activeTab === 1 ? styles.androidPageSlot : styles.androidPageHiddenSlot}>
            {activeTab === 1 ? renderRaceBoardPage() : null}
          </View>
          <View style={activeTab === 2 ? styles.androidPageSlot : styles.androidPageHiddenSlot}>
            {activeTab === 2 ? renderStatsPage() : null}
          </View>
        </View>
        <Text style={styles.hint}>위 탭을 누르면 순위와 기록 화면을 볼 수 있어요.</Text>
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      <LiveMatchPagerTabs
        activeTab={activeTab}
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
