import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform } from 'react-native';

import {
  fitZoomFor,
  UNIVERSE_MAX_ZOOM_FACTOR,
  UNIVERSE_MIN_ZOOM_FACTOR,
} from '@/features/universe/utils/universeSpace';

// 우주 뷰포트 — 확대/축소와 이동.
//
// 하나의 상태를 3D 레이어와 RN 레이블 레이어가 **같이** 쓴다. 두 레이어가 각자 변환을 갖는
// 순간 이름이 천체를 벗어나므로, 여기서 나온 값만이 두 곳의 유일한 근원이다.
//
// 좌표 변환 규약 (두 레이어가 반드시 동일하게 적용):
//   screen = canvasCenter + universe * zoom + pan
// 3D는 같은 식을 group scale=zoom, position=[panX, -panY]로 표현한다(부호는 y축 반전 때문).
//
// 확대는 그저 카메라를 가까이 가져갈 뿐이다 — 어떤 문턱도, 층 전환도 여기엔 없다.

export type UniverseViewport = {
  zoom: number;
  panX: number;
  panY: number;
};

function clampZoomTo(zoom: number, fitZoom: number): number {
  return Math.min(
    fitZoom * UNIVERSE_MAX_ZOOM_FACTOR,
    Math.max(fitZoom * UNIVERSE_MIN_ZOOM_FACTOR, zoom),
  );
}

// 한 점(앵커)을 화면에 고정한 채 배율만 바꾼다 — 커서/손가락 아래가 안 밀리는 확대.
export function zoomAroundPoint(
  viewport: UniverseViewport,
  nextZoomRaw: number,
  anchorX: number,
  anchorY: number,
  centerX: number,
  centerY: number,
  fitZoom: number,
): UniverseViewport {
  const nextZoom = clampZoomTo(nextZoomRaw, fitZoom);
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
  // 화면에 나라가 꽉 차는 배율. 화면이 바뀌면 이 값도 바뀌지만, **이미 정해진 배율·이동은
  // 건드리지 않는다** — 세계 좌표는 화면과 무관하므로 보고 있던 자리가 그대로 있어야 한다.
  // 이 값은 처음 배율과 한계를 정하는 데만 쓴다.
  const fitZoom = fitZoomFor(width, height);
  const fitZoomRef = useRef(fitZoom);
  fitZoomRef.current = fitZoom;
  const [viewport, setViewport] = useState<UniverseViewport>(
    () => ({ zoom: fitZoomFor(width, height), panX: 0, panY: 0 }),
  );
  // 제스처 중에는 렌더마다 최신 값이 필요하다 — state는 비동기라 ref로 같이 들고 간다.
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  // 제스처의 기준점. 손가락 수가 바뀔 때마다 다시 심는다 — 아래 onPanResponderMove 주석 참고.
  const gestureStartRef = useRef<{
    viewport: UniverseViewport;
    distance: number;
    dx: number;
    dy: number;
    touchCount: number;
  } | null>(null);
  // 캔버스의 화면상 원점. 터치의 pageX/pageY는 **루트 뷰** 기준이라 그대로 쓰면 헤더·안전
  // 영역 높이만큼 어긋난 자리를 확대 중심으로 잡는다 — 손가락 아래가 고정되지 않고 장면이
  // 계속 밀려난다. 웹 휠 경로가 getBoundingClientRect를 빼는 것과 같은 보정이다.
  const containerOriginRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<{ measureInWindow?: (callback: (x: number, y: number) => void) => void } | null>(null);
  const centerX = width / 2;
  const centerY = height / 2;

  // 레이아웃이 잡히거나 바뀔 때(회전·키보드) 원점을 다시 잰다.
  const measureContainer = useCallback(() => {
    containerRef.current?.measureInWindow?.((x, y) => {
      containerOriginRef.current = { x, y };
    });
  }, []);

  // 처음 자리로 — 나라 전체가 화면에 들어차는 배율, 중앙.
  const reset = useCallback(() => {
    setViewport({ zoom: fitZoomRef.current, panX: 0, panY: 0 });
  }, []);

  const apply = useCallback((next: UniverseViewport) => {
    setViewport(next);
  }, []);

  // 직전 값에서 이어서 계산해야 하는 변화(휠처럼 한 프레임에 여러 번 들어오는 것)는 반드시
  // 함수형으로 — ref를 읽으면 같은 프레임의 이벤트가 전부 같은 시작값을 써서 대부분이 삼켜진다
  // (트랙패드로 빠르게 굴리면 확대가 거의 안 되던 증상).
  const step = useCallback((reduce: (previous: UniverseViewport) => UniverseViewport) => {
    setViewport(reduce);
  }, []);

  // 우주 좌표의 한 점을 화면 한가운데로 가져온다 — 검색 착지·'내 행성으로'·천체 두 번 누르기.
  const focusOn = useCallback((targetX: number, targetY: number, zoom: number) => {
    const nextZoom = clampZoomTo(zoom, fitZoomRef.current);
    setViewport({
      zoom: nextZoom,
      panX: -targetX * nextZoom,
      panY: -targetY * nextZoom,
    });
  }, []);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    // 살짝의 흔들림은 탭으로 남긴다 — 천체를 누르는 동작을 뺏지 않기 위해.
    //
    // 다만 손가락이 둘이면 흔들림과 무관하게 곧바로 가져온다. RN의 dx/dy는 움직인 터치들의
    // **중점** 이동량이라, 좌우로 고르게 벌리는 전형적인 핀치에서는 두 손가락의 변화가 서로
    // 상쇄돼 dx/dy가 0 근처에 머문다 — 문턱을 못 넘어 확대가 통째로 무시되고, 손을 떼면
    // 그 아래 천체의 탭으로 처리되던 버그가 여기서 나왔다.
    onMoveShouldSetPanResponder: (event, gesture) => (
      (event.nativeEvent.touches ?? []).length >= 2 || Math.hypot(gesture.dx, gesture.dy) > 6
    ),
    onPanResponderGrant: (event, gesture) => {
      const touches = event.nativeEvent.touches ?? [];
      measureContainer();
      gestureStartRef.current = {
        viewport: viewportRef.current,
        distance: touches.length >= 2 ? touchDistance(touches as never) : 0,
        dx: gesture.dx,
        dy: gesture.dy,
        touchCount: touches.length,
      };
    },
    onPanResponderMove: (event, gesture) => {
      const start = gestureStartRef.current;
      const touches = event.nativeEvent.touches ?? [];

      // 손가락 수가 바뀌면 기준을 **그 순간의 뷰포트로** 다시 심는다. RN은 한 손가락만 떼도
      // release를 주지 않아서(마지막 손가락까지 떼야 준다) 기준이 그대로 남는데, 그러면:
      //  - 핀치로 확대한 뒤 한 손가락을 먼저 떼는 순간, 남은 손가락의 다음 이동이 pan 분기로
      //    떨어지며 zoom을 제스처 시작값으로 되돌려 버린다(확대가 통째로 취소됨).
      //  - 한 손가락으로 끌다가 두 번째 손가락을 얹으면 distance가 0으로 굳어 있어 핀치가
      //    영영 안 잡힌다('훑어보다 확대'가 죽는다).
      // dx/dy도 같이 기억해 두 손가락 시절의 누적 이동이 pan에 튀지 않게 한다.
      if (!start || start.touchCount !== touches.length) {
        gestureStartRef.current = {
          viewport: viewportRef.current,
          distance: touches.length >= 2 ? touchDistance(touches as never) : 0,
          dx: gesture.dx,
          dy: gesture.dy,
          touchCount: touches.length,
        };
        return;
      }

      if (touches.length >= 2 && start.distance > 0) {
        // 핀치 — 두 손가락 중점을 앵커로 잡아 그 지점이 제자리에 머문다.
        const nextDistance = touchDistance(touches as never);
        const origin = containerOriginRef.current;
        const anchorX = (touches[0].pageX + touches[1].pageX) / 2 - origin.x;
        const anchorY = (touches[0].pageY + touches[1].pageY) / 2 - origin.y;
        apply(zoomAroundPoint(
          start.viewport,
          start.viewport.zoom * (nextDistance / start.distance),
          anchorX,
          anchorY,
          centerX,
          centerY,
          fitZoomRef.current,
        ));
        return;
      }

      // 끌기는 배율도 조준점도 바꾸지 않는다 — 겨눈 대상은 확대할 때만 정해진다.
      apply({
        ...start.viewport,
        panX: start.viewport.panX + (gesture.dx - start.dx),
        panY: start.viewport.panY + (gesture.dy - start.dy),
      });
    },
    onPanResponderRelease: () => {
      gestureStartRef.current = null;
    },
    onPanResponderTerminate: () => {
      gestureStartRef.current = null;
    },
  }), [apply, centerX, centerY, measureContainer]);

  // 웹 휠 확대 — RN View에는 onWheel이 없어 DOM 리스너로 붙인다(웹에서만 동작).
  // 네이티브에서 원점을 재는 것과 **같은 View**를 가리킨다: 확대 중심의 기준이 두 벌이 되면
  // 플랫폼마다 다른 자리를 확대하게 된다.
  useEffect(() => {
    if (Platform.OS !== 'web') {
      return undefined;
    }

    const node = containerRef.current as unknown as { addEventListener?: (t: string, h: (e: never) => void, o?: unknown) => void; removeEventListener?: (t: string, h: (e: never) => void) => void; getBoundingClientRect?: () => { left: number; top: number } } | null;

    if (!node?.addEventListener) {
      return undefined;
    }

    const handleWheel = (event: never) => {
      const wheel = event as unknown as { deltaY: number; clientX: number; clientY: number; preventDefault: () => void };
      wheel.preventDefault();
      const rect = node.getBoundingClientRect?.() ?? { left: 0, top: 0 };
      // 휠 한 칸을 배율로 — 지수라 어느 배율에서도 체감이 같다. 나라에서 한 사람까지가
      // 600배라, 한 칸이 너무 작으면 끝까지 가는 데 서른 번을 굴려야 한다.
      const factor = Math.exp(-wheel.deltaY * 0.0026);
      const anchorX = wheel.clientX - rect.left;
      const anchorY = wheel.clientY - rect.top;
      step((previous) => zoomAroundPoint(
        previous,
        previous.zoom * factor,
        anchorX,
        anchorY,
        centerX,
        centerY,
        fitZoomRef.current,
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
    // 화면은 이 셋을 캔버스 컨테이너 View에 그대로 달아야 한다 — 하나라도 빠지면 확대
    // 중심이 어긋난다(원점을 못 재거나, 웹 휠이 안 붙거나).
    containerRef,
    onContainerLayout: measureContainer,
  };
}
