import { TOUR_STEPS } from '@/features/tour/tourSteps';

// 투어 진행 상태 — 모듈 싱글턴 (soloRunGoalStore 와 같은 패턴, RN 무의존).
// 오버레이(TourOverlay)가 구독하고, 홈 헤더 ? 버튼이 startTour 를 부른다.

export type TourState = {
  active: boolean;
  stepIndex: number;
};

let state: TourState = { active: false, stepIndex: 0 };
const listeners = new Set<() => void>();

function setState(next: TourState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export function getTourState(): TourState {
  return state;
}

export function subscribeTour(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function startTour(): void {
  setState({ active: true, stepIndex: 0 });
}

export function stopTour(): void {
  setState({ active: false, stepIndex: 0 });
}

// 마지막 스텝에서 다음 = 투어 종료.
export function nextTourStep(): void {
  if (!state.active) {
    return;
  }
  if (state.stepIndex + 1 >= TOUR_STEPS.length) {
    stopTour();
    return;
  }
  setState({ active: true, stepIndex: state.stepIndex + 1 });
}
