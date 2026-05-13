import { memo, useCallback, useMemo } from 'react';
import type { ReactNode, RefObject } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useDevRenderCounter } from '@/utils/useDevRenderCounter';

type LiveMatchPageRenderer = () => ReactNode;

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

type PagerTab = {
  index: number;
  label: string;
};

const BASE_TABS: PagerTab[] = [
  { index: 0, label: '대결 보기' },
  { index: 1, label: '순위 보기' },
  { index: 2, label: '기록 보기' },
];
const RESULT_TAB: PagerTab = { index: 3, label: '결과 보기' };

const EMPTY_PAGE_RENDERER: LiveMatchPageRenderer = () => null;

function resolvePageRenderer({
  page,
  hasResultPage,
  renderArenaPage,
  renderRaceBoardPage,
  renderStatsPage,
  renderResultPage,
}: {
  page: number;
  hasResultPage: boolean;
  renderArenaPage: LiveMatchPageRenderer;
  renderRaceBoardPage: LiveMatchPageRenderer;
  renderStatsPage: LiveMatchPageRenderer;
  renderResultPage?: LiveMatchPageRenderer;
}) {
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

const PagerTabButton = memo(function PagerTabButton({
  tab,
  selected,
  onPress,
}: {
  tab: PagerTab;
  selected: boolean;
  onPress: (index: number) => void;
}) {
  const handlePress = useCallback(() => {
    onPress(tab.index);
  }, [onPress, tab.index]);

  return (
    <Pressable
      style={[styles.tab, selected ? styles.tabSelected : undefined]}
      onPress={handlePress}
    >
      <Text style={[styles.tabText, selected ? styles.tabTextSelected : undefined]}>
        {tab.label}
      </Text>
    </Pressable>
  );
});

const PagerPageSlot = memo(function PagerPageSlot({
  shouldRender,
  pageStyle,
  renderPage,
}: {
  shouldRender: boolean;
  pageStyle: StyleProp<ViewStyle>;
  renderPage: LiveMatchPageRenderer;
}) {
  return (
    <View style={pageStyle}>
      {shouldRender ? renderPage() : null}
    </View>
  );
}, (prevProps, nextProps) => {
  if (!prevProps.shouldRender && !nextProps.shouldRender) {
    return prevProps.pageStyle === nextProps.pageStyle;
  }

  return (
    prevProps.shouldRender === nextProps.shouldRender
    && prevProps.pageStyle === nextProps.pageStyle
    && prevProps.renderPage === nextProps.renderPage
  );
});

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
    if (index === 3) {
      return hasResultPage && page === 3;
    }

    return page === index;
  }, [hasResultPage, page]);

  const activePageRenderer = useMemo(() => (
    resolvePageRenderer({
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

  const tabRow = useMemo(() => (
    <View style={styles.tabRow}>
      <PagerTabButton
        tab={BASE_TABS[0]}
        selected={page === BASE_TABS[0].index}
        onPress={handleTabPress}
      />
      <PagerTabButton
        tab={BASE_TABS[1]}
        selected={page === BASE_TABS[1].index}
        onPress={handleTabPress}
      />
      <PagerTabButton
        tab={BASE_TABS[2]}
        selected={page === BASE_TABS[2].index}
        onPress={handleTabPress}
      />
      {hasResultPage ? (
        <PagerTabButton
          tab={RESULT_TAB}
          selected={page === RESULT_TAB.index}
          onPress={handleTabPress}
        />
      ) : null}
    </View>
  ), [handleTabPress, hasResultPage, page]);

  if (Platform.OS === 'android') {
    return (
      <View style={styles.shell}>
        {tabRow}
        <View style={styles.androidPage}>
          {activePageRenderer()}
        </View>
        <Text style={styles.hint}>위 탭을 누르면 순위와 기록 화면을 볼 수 있어요.</Text>
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      {tabRow}
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
        <PagerPageSlot
          shouldRender={shouldRenderScrollPage(0)}
          pageStyle={pageStyle}
          renderPage={renderArenaPage}
        />
        <PagerPageSlot
          shouldRender={shouldRenderScrollPage(1)}
          pageStyle={pageStyle}
          renderPage={renderRaceBoardPage}
        />
        <PagerPageSlot
          shouldRender={shouldRenderScrollPage(2)}
          pageStyle={pageStyle}
          renderPage={renderStatsPage}
        />
        {hasResultPage ? (
          <PagerPageSlot
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
});

const styles = StyleSheet.create({
  shell: {
    gap: 12,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  tabSelected: {
    borderColor: '#6D5EF7',
    backgroundColor: '#EEF2FF',
  },
  tabText: {
    color: '#667085',
    fontSize: 14,
    fontWeight: '800',
  },
  tabTextSelected: {
    color: '#4F46E5',
  },
  page: {
    gap: 14,
    paddingRight: 0,
  },
  androidPage: {
    gap: 14,
  },
  hint: {
    color: '#98A2B3',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '700',
  },
});
