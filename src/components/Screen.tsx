import { MutableRefObject, PropsWithChildren, useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@/theme/tokens';

export function Screen({
  children,
  scrollToTopKey,
  scrollRef,
}: PropsWithChildren<{
  scrollToTopKey?: string;
  scrollRef?: MutableRefObject<ScrollView | null>;
}>) {
  const insets = useSafeAreaInsets();
  const internalScrollRef = useRef<ScrollView>(null);
  const activeScrollRef = scrollRef ?? internalScrollRef;

  useEffect(() => {
    if (!scrollToTopKey) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      activeScrollRef.current?.scrollTo({ y: 0, animated: false });
    });

    return () => cancelAnimationFrame(frameId);
  }, [activeScrollRef, scrollToTopKey]);

  return (
    // 배경색은 렌더 시점에 읽는다: 이 모듈은 RouteErrorBoundary 재수출 경로로 테마 게이트보다
    // 먼저 import되므로, StyleSheet에 구우면 라이트 모드 부팅에서도 다크 배경이 박제된다.
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surfaceApp }]} edges={['top']}>
      <ScrollView
        ref={activeScrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: 120 + Math.max(insets.bottom, 16) }]}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
      >
        <View style={styles.inner}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    paddingBottom: 136,
  },
  inner: {
    paddingHorizontal: spacing.s16,
    paddingTop: spacing.s12,
    gap: spacing.s14,
  },
});
