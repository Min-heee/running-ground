// 경찰과 도둑런 모듈 컨텍스트 — 2300줄짜리 러닝 런타임에 prop을 관통시키는 대신
// pendingMatchSaveContext와 같은 모듈 싱글턴 패턴을 쓴다 (in-memory v1: 앱 재시작으로
// 러닝 중 컨텍스트가 날아가면 그 러닝은 일반 혼자런으로 저장 — 매치 컨텍스트와 동일한
// 수용 트레이드오프).
//
// 수명 규칙:
//  - selected: 셋업 카드에서 고른 경기장. 카드 UI가 useSyncExternalStore로 구독.
//  - active: 러닝 시작 시점(useStartTrackingAction)에 selected를 잠근 스냅샷.
//    chase 모드가 아니면 시작 시점에 반드시 clear — 이전 chase 선택이 다음 혼자런에
//    태그로 새는 것을 차단. 저장 성공(useRunSaveCommand) 후 clear, 저장 실패 시엔
//    유지되어 paused-shell 재시도가 같은 경기장 태그로 저장된다.

import type { ChaseArenaSummary } from '@/lib/api/types';

export type ActiveChaseArena = {
  arenaId: string;
  arenaName: string;
  latitude: number;
  longitude: number;
  radiusM: number;
  polygon?: { latitude: number; longitude: number }[];
};

let selectedArena: ChaseArenaSummary | null = null;
let activeArena: ActiveChaseArena | null = null;
// 경기장 상세 화면(/chase-arena)의 '러닝 시작' → 러닝 탭의 시작 플로우로 넘기는 원샷 신호.
// 시작 로직(입장→GPS)은 러닝 탭 런타임에 살아 있으므로, 화면은 신호만 남기고 복귀한다.
let autoStartRequested = false;
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

export function subscribeChaseRunContext(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSelectedChaseArena(): ChaseArenaSummary | null {
  return selectedArena;
}

export function setSelectedChaseArena(arena: ChaseArenaSummary | null) {
  selectedArena = arena;
  emitChange();
}

// 시작 액션이 서버 입장에 성공한 경기장을 그대로 잠근다 — 카드의 현재 선택을 재독하지
// 않으므로 입장 왕복 중 선택이 바뀌어도 태그가 어긋나지 않는다.
export function setActiveChaseArena(arena: ActiveChaseArena | null) {
  activeArena = arena;
}

export function clearActiveChaseArena() {
  activeArena = null;
}

export function getActiveChaseArena(): ActiveChaseArena | null {
  return activeArena;
}

export function requestChaseAutoStart() {
  autoStartRequested = true;
  emitChange();
}

export function consumeChaseAutoStart(): boolean {
  const requested = autoStartRequested;
  autoStartRequested = false;
  return requested;
}
