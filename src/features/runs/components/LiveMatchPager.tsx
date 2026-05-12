import type { ReactNode, RefObject } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type LiveMatchPagerProps = {
  scrollRef: RefObject<ScrollView | null>;
  page: number;
  pageWidth: number;
  hasResultPage: boolean;
  arenaPage: ReactNode;
  raceBoardPage: ReactNode;
  statsPage: ReactNode;
  resultPage?: ReactNode;
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

export function LiveMatchPager({
  scrollRef,
  page,
  pageWidth,
  hasResultPage,
  arenaPage,
  raceBoardPage,
  statsPage,
  resultPage,
  onPageChange,
}: LiveMatchPagerProps) {
  const tabs = hasResultPage ? [...BASE_TABS, RESULT_TAB] : BASE_TABS;
  const pages = [arenaPage, raceBoardPage, statsPage, ...(hasResultPage ? [resultPage] : [])];
  const activePage = pages[page] ?? pages[0];

  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pageWidth <= 0) {
      return;
    }
    onPageChange(Math.round(event.nativeEvent.contentOffset.x / pageWidth));
  };

  const renderTabRow = () => (
    <View style={styles.tabRow}>
      {tabs.map((tab) => {
        const isSelected = page === tab.index;

        return (
          <Pressable
            key={tab.index}
            style={[styles.tab, isSelected ? styles.tabSelected : undefined]}
            onPress={() => {
              if (Platform.OS === 'android') {
                onPageChange(tab.index);
                return;
              }

              scrollRef.current?.scrollTo({ x: pageWidth * tab.index, animated: true });
              onPageChange(tab.index);
            }}
          >
            <Text style={[styles.tabText, isSelected ? styles.tabTextSelected : undefined]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  if (Platform.OS === 'android') {
    return (
      <View style={styles.shell}>
        {renderTabRow()}
        <View style={styles.androidPage}>
          {activePage}
        </View>
        <Text style={styles.hint}>위 탭을 누르면 순위와 기록 화면을 볼 수 있어요.</Text>
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      {renderTabRow()}
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
        <View style={[styles.page, { width: pageWidth }]}>
          {arenaPage}
        </View>
        <View style={[styles.page, { width: pageWidth }]}>
          {raceBoardPage}
        </View>
        <View style={[styles.page, { width: pageWidth }]}>
          {statsPage}
        </View>
        {hasResultPage ? (
          <View style={[styles.page, { width: pageWidth }]}>
            {resultPage}
          </View>
        ) : null}
      </ScrollView>
      <Text style={styles.hint}>
        {hasResultPage
          ? '옆으로 넘기면 순위, 기록, 결과 화면을 볼 수 있어요.'
          : '옆으로 넘기면 순위와 기록 화면을 볼 수 있어요.'}
      </Text>
    </View>
  );
}

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
