import { MutableRefObject, PropsWithChildren, useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View, type GestureResponderHandlers } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@/theme/tokens';

export function Screen({
  children,
  scrollToTopKey,
  scrollRef,
  // Screen-wide responder handlers (e.g. the region drill-down edge-swipe-back).
  // Spread on the root so the left-edge gesture works at any vertical position.
  panHandlers,
}: PropsWithChildren<{
  scrollToTopKey?: string;
  scrollRef?: MutableRefObject<ScrollView | null>;
  panHandlers?: GestureResponderHandlers;
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
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.surfaceApp }]} edges={['top']} {...panHandlers}>
      {/* 미드나잇 글래스 배경 오로라 — 라디얼 그라데이션 근사(저투명 원 3겹).
          다크 전용(라이트는 토큰이 transparent). 색은 테마 게이트 이후 값을 쓰도록
          렌더 시점에 읽는다. */}
      <View pointerEvents="none" style={styles.aurora}>
        <View style={[styles.auroraBlob, {
          top: -320, left: -180, width: 640, height: 640, borderRadius: 320,
          backgroundColor: colors.auroraGlowVioletWide,
        }]} />
        <View style={[styles.auroraBlob, {
          top: -260, left: -120, width: 440, height: 440, borderRadius: 220,
          backgroundColor: colors.auroraGlowViolet,
        }]} />
        <View style={[styles.auroraBlob, {
          bottom: -280, right: -200, width: 560, height: 560, borderRadius: 280,
          backgroundColor: colors.auroraGlowCyan,
        }]} />
      </View>
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
  aurora: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  auroraBlob: {
    position: 'absolute',
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
