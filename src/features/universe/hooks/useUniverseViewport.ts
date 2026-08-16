import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform } from 'react-native';

import { UNIVERSE_MAX_ZOOM, UNIVERSE_MIN_ZOOM } from '@/features/universe/utils/universeLod';

// 우주 뷰포트 — 확대/축소와 이동 (오너 2026-08-15: "확대할수록 항성·행성에 가까워지게").
//
// 하나의 상태를 3D 레이어와 RN 레이블 레이어가 **같이** 쓴다. 두 레이어가 각자 변환을 갖는
// 순간 이름이 천체를 벗어나므로, 여기서 나온 값만이 두 곳의 유일한 근원이다.
//
// 화면 좌표 변환 규약 (두 레이어가 반드시 동일하게 적용):
//   screen = (base - center) * zoom + center + pan
// 3D는 같은 식을 group scale=zoom, position=[panX, -panY]로 표현한다(부호는 y축 반전 때문).

// 배율 한계는 LOD 문턱들과 같은 파일(universeLod)에 산다 — 두 벌이 되면 "확대해도 안
// 들어가지는" 조합이 조용히 생긴다. 여기서는 다시 내보내기만 한다.
export { UNIVERSE_MAX_ZOOM, UNIVERSE_MIN_ZOOM } from '@/features/universe/utils/universeLod';

export type UniverseViewport = {
  zoom: number;
  panX: number;
  panY: number;
};

const IDENTITY: UniverseViewport = { zoom: 1, panX: 0, panY: 0 };

function clampZoom(zoom: number): number {
  return Math.min(UNIVERSE_MAX_ZOOM, Math.max(UNIVERSE_MIN_ZOOM, zoom));
}

// 한 점(앵커)을 화면에 고정한 채 배율만 바꾼다 — 커서/손가락 아래가 안 밀리는 확대.
export function zoomAroundPoint(
  viewport: UniverseViewport,
  nextZoomRaw: number,
  anchorX: number,
  anchorY: number,
  centerX: number,
  centerY: number,
): UniverseViewport {
  const nextZoom = clampZoom(nextZoomRaw);
  const ratio = nextZoom / viewport.zoom;

  // 앵커의 화면 위치가 불변이 되도록 pan을 역산한다.
  return {
    zoom: nextZoom,
    panX: anchorX - centerX - ratio * (anchorX - centerX - viewport.panX),
    panY: anchorY - centerY - ratio * (anchorY - centerY - viewport.panY),
  };
}

function touchDistance(touches: { pageX: number; pageY: number }[]): number {
  const [first, second] = touches;
  return Math.hypot(first.pageX - second.pageX, first.pageY - second.pageY);
}

export function useUniverseViewport({ width, height }: { width: number; height: number }) {
  const [viewport, setViewport] = useState<UniverseViewport>(IDENTITY);
  // 제스처 중에는 렌더마다 최신 값이 필요하다 — state는 비동기라 ref로 같이 들고 간다.
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const gestureStartRef = useRef<{ viewport: UniverseViewport; distance: number } | null>(null);
  const centerX = width / 2;
  const centerY = height / 2;

  const reset = useCallback(() => setViewport(IDENTITY), []);

  const apply = useCallback((next: UniverseViewport) => {
    setViewport(next);
  }, []);

  // 직전 값에서 이어서 계산해야 하는 변화(휠처럼 한 프레임에 여러 번 들어오는 것)는 반드시
  // 함수형으로 — ref를 읽으면 같은 프레임의 이벤트가 전부 같은 시작값을 써서 대부분이 삼켜진다
  // (트랙패드로 빠르게 굴리면 확대가 거의 안 되던 증상).
  const step = useCallback((reduce: (previous: UniverseViewport) => UniverseViewport) => {
    setViewport(reduce);
  }, []);

  // 특정 지점으로 날아간다 — 검색 결과나 '내 행성으로'가 쓸 진입점.
  const focusOn = useCallback((targetX: number, targetY: number, zoom: number) => {
    const nextZoom = clampZoom(zoom);
    setViewport({
      zoom: nextZoom,
      panX: -(targetX - width / 2) * nextZoom,
      panY: -(targetY - height / 2) * nextZoom,
    });
  }, [height, width]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    // 살짝의 흔들림은 탭으로 남긴다 — 천체를 누르는 동작을 뺏지 않기 위해.
    onMoveShouldSetPanResponder: (_event, gesture) => Math.hypot(gesture.dx, gesture.dy) > 6,
    onPanResponderGrant: (event) => {
      const touches = event.nativeEvent.touches ?? [];
      gestureStartRef.current = {
        viewport: viewportRef.current,
        distance: touches.length >= 2 ? touchDistance(touches as never) : 0,
      };
    },
    onPanResponderMove: (event, gesture) => {
      const start = gestureStartRef.current;

      if (!start) {
        return;
      }

      const touches = event.nativeEvent.touches ?? [];

      if (touches.length >= 2 && start.distance > 0) {
        // 핀치 — 두 손가락 중점을 앵커로 잡아 그 지점이 제자리에 머문다.
        const nextDistance = touchDistance(touches as never);
        const anchorX = (touches[0].pageX + touches[1].pageX) / 2;
        const anchorY = (touches[0].pageY + touches[1].pageY) / 2;
        apply(zoomAroundPoint(
          start.viewport,
          start.viewport.zoom * (nextDistance / start.distance),
          anchorX,
          anchorY,
          centerX,
          centerY,
        ));
        return;
      }

      apply({
        zoom: start.viewport.zoom,
        panX: start.viewport.panX + gesture.dx,
        panY: start.viewport.panY + gesture.dy,
      });
    },
    onPanResponderRelease: () => {
      gestureStartRef.current = null;
    },
    onPanResponderTerminate: () => {
      gestureStartRef.current = null;
    },
  }), [apply, centerX, centerY]);

  // 웹 휠 확대 — RN View에는 onWheel이 없어 DOM 리스너로 붙인다(웹에서만 동작).
  const webWheelRef = useRef<unknown>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') {
      return undefined;
    }

    const node = webWheelRef.current as { addEventListener?: (t: string, h: (e: never) => void, o?: unknown) => void; removeEventListener?: (t: string, h: (e: never) => void) => void; getBoundingClientRect?: () => { left: number; top: number } } | null;

    if (!node?.addEventListener) {
      return undefined;
    }

    const handleWheel = (event: never) => {
      const wheel = event as unknown as { deltaY: number; clientX: number; clientY: number; preventDefault: () => void };
      wheel.preventDefault();
      const rect = node.getBoundingClientRect?.() ?? { left: 0, top: 0 };
      // 휠 한 칸을 배율로 — 지수라 어느 배율에서도 체감이 같다.
      const factor = Math.exp(-wheel.deltaY * 0.0016);
      const anchorX = wheel.clientX - rect.left;
      const anchorY = wheel.clientY - rect.top;
      step((previous) => zoomAroundPoint(
        previous,
        previous.zoom * factor,
        anchorX,
        anchorY,
        centerX,
        centerY,
      ));
    };

    node.addEventListener('wheel', handleWheel, { passive: false });
    return () => node.removeEventListener?.('wheel', handleWheel);
  }, [centerX, centerY, step]);

  return {
    viewport,
    reset,
    focusOn,
    panHandlers: panResponder.panHandlers,
    webWheelRef,
  };
}
