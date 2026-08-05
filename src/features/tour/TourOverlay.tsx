import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { TOUR_STEPS } from '@/features/tour/tourSteps';
import { getTourState, nextTourStep, stopTour, subscribeTour } from '@/features/tour/tourStore';
import { measureTourTarget, type TourRect } from '@/features/tour/tourTargetRegistry';
import { fixedColors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

// 사용설명 투어 오버레이 (오너 2026-08-06): 탭 레이아웃 위에 절대 배치로 얹혀서
// 스텝마다 (1) 해당 탭으로 이동 (2) 타깃을 측정해 스포트라이트 링 + 말풍선을 그린다.
// 탭이 lazy 마운트라 측정은 재시도 루프(최대 12회 × 150ms)로 기다린다. 끝내 못 찾으면
// 스포트라이트 없이 가운데 말풍선으로 대체 — 투어가 막히는 일은 없다.
// 색은 전부 고정(fixed) — 어두운 딤 위 흰 말풍선은 라이트/다크 모두 성립한다.

const MEASURE_ATTEMPTS = 12;
const MEASURE_INTERVAL_MS = 150;
const RING_INSET = 6;
const BUBBLE_MARGIN = 12;
const BUBBLE_ESTIMATED_HEIGHT = 170;

export function TourOverlay() {
  const tour = useSyncExternalStore(subscribeTour, getTourState, getTourState);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [rect, setRect] = useState<TourRect | null>(null);

  const step = tour.active ? TOUR_STEPS[tour.stepIndex] : undefined;

  // 안드로이드 하드웨어 뒤로가기 = 투어 종료. 오버레이가 전 화면 터치를 막는 동안
  // 말풍선 버튼 외 탈출 수단이 없어지는 소프트락 방지 (적대 리뷰 2026-08-06).
  useEffect(() => {
    if (!tour.active) {
      return undefined;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      stopTour();
      return true;
    });
    return () => subscription.remove();
  }, [tour.active]);

  useEffect(() => {
    if (!step) {
      setRect(null);
      return undefined;
    }

    let cancelled = false;
    setRect(null);
    router.navigate(step.route as never);

    (async () => {
      for (let attempt = 0; attempt < MEASURE_ATTEMPTS && !cancelled; attempt += 1) {
        const measured = await measureTourTarget(step.targetId);
        if (cancelled) {
          return;
        }
        // 뷰포트 밖(스크롤 아래 등) rect 를 받아들이면 딤이 전면을 덮고 말풍선이
        // 화면 밖으로 밀려 탈출 버튼이 사라진다 (적대 리뷰 확정 소프트락) —
        // 충분히 보이는 타깃만 스포트라이트, 아니면 중앙 말풍선 폴백.
        if (
          measured
          && measured.y + measured.height > 80
          && measured.y < windowHeight - 120
        ) {
          setRect(measured);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, MEASURE_INTERVAL_MS));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [step, windowHeight]);

  const handleNext = useCallback(() => nextTourStep(), []);
  const handleStop = useCallback(() => stopTour(), []);

  if (!step) {
    return null;
  }

  const isLastStep = tour.stepIndex === TOUR_STEPS.length - 1;

  // 스포트라이트 구멍 주변 4분할 딤 — 마스크 없이 구멍을 뚫는 표준 수법.
  const hole = rect
    ? {
      left: Math.max(0, rect.x - RING_INSET),
      top: Math.max(0, rect.y - RING_INSET),
      right: Math.min(windowWidth, rect.x + rect.width + RING_INSET),
      bottom: Math.min(windowHeight, rect.y + rect.height + RING_INSET),
    }
    : null;

  // 말풍선 위치: 타깃 아래 공간이 충분하면 아래, 아니면 위.
  const bubblePosition = hole
    ? (hole.bottom + BUBBLE_ESTIMATED_HEIGHT + BUBBLE_MARGIN < windowHeight
      ? { top: hole.bottom + BUBBLE_MARGIN }
      : { bottom: windowHeight - hole.top + BUBBLE_MARGIN })
    : { top: windowHeight * 0.32 };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="auto">
      {hole ? (
        <>
          <View style={[styles.dim, { left: 0, right: 0, top: 0, height: hole.top }]} />
          <View style={[styles.dim, { left: 0, right: 0, top: hole.bottom, bottom: 0 }]} />
          <View style={[styles.dim, { left: 0, width: hole.left, top: hole.top, height: hole.bottom - hole.top }]} />
          <View style={[styles.dim, { left: hole.right, right: 0, top: hole.top, height: hole.bottom - hole.top }]} />
          <View
            pointerEvents="none"
            style={[styles.ring, {
              left: hole.left,
              top: hole.top,
              width: hole.right - hole.left,
              height: hole.bottom - hole.top,
            }]}
          />
        </>
      ) : (
        <View style={[styles.dim, StyleSheet.absoluteFill as object]} />
      )}

      {/* 말풍선은 측정을 기다리지 않고 즉시 표시 — 측정 실패/지연 시에도
          건너뛰기·다음 버튼이 항상 손에 닿는다. rect 가 오면 위치만 옮겨간다. */}
      {(
        <View style={[styles.bubble, bubblePosition]}>
          <Text style={styles.bubbleTitle}>{step.title}</Text>
          <Text style={styles.bubbleBody}>{step.body}</Text>
          <View style={styles.bubbleFooter}>
            <Pressable onPress={handleStop} hitSlop={10} accessibilityRole="button" accessibilityLabel="투어 건너뛰기">
              <Text style={styles.skipText}>건너뛰기</Text>
            </Pressable>
            <Text style={styles.stepCounter}>{tour.stepIndex + 1}/{TOUR_STEPS.length}</Text>
            <Pressable onPress={handleNext} hitSlop={10} accessibilityRole="button" accessibilityLabel={isLastStep ? '투어 완료' : '다음 설명'}>
              <Text style={styles.nextText}>{isLastStep ? '완료' : '다음'}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dim: {
    position: 'absolute',
    backgroundColor: 'rgba(9, 12, 26, 0.62)',
  },
  ring: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: fixedColors.brand,
    borderRadius: radii.lg,
  },
  bubble: {
    position: 'absolute',
    left: spacing.s20,
    right: spacing.s20,
    backgroundColor: fixedColors.white,
    borderRadius: radii.xl,
    padding: spacing.s18,
    gap: spacing.s10,
  },
  bubbleTitle: {
    color: fixedColors.brand,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
  bubbleBody: {
    color: '#334155',
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    lineHeight: 22,
  },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  skipText: {
    color: '#98A2B3',
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  stepCounter: {
    color: '#CBD5E1',
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  nextText: {
    color: fixedColors.brand,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
});
