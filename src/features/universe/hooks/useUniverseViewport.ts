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
  // 조준점(기저 좌표) — 마지막으로 확대한 지점 아래에 있던 천체 위치.
  //
  // 화면 중앙이 아니라 이 값이 "무엇을 향해 파고드는가"의 답이다. 커서/손가락을 고정하는
  // 확대에서는 겨눈 천체가 중앙이 아니라 **앵커 아래**에 머물기 때문에, 중앙으로 재면
  // 확대할수록 겨눈 것이 중앙에서 멀어져 영영 열리지 않는다.
  aimX: number;
  aimY: number;
};

const IDENTITY: Omit<UniverseViewport, 'aimX' | 'aimY'> = { zoom: 1, panX: 0, panY: 0 };

function clampZoom(zoom: number): number {
  return Math.min(UNIVERSE_MAX_ZOOM, Math.max(UNIVERSE_MIN_ZOOM, zoom));
}

// 화면 좌표 → 기저 좌표. screen = (base - center) * zoom + center + pan 의 역.
export function toBasePoint(
  viewport: UniverseViewport,
  screenX: number,
  screenY: number,
  centerX: number,
  centerY: number,
): { x: number; y: number } {
  return {
    x: centerX + (screenX - centerX - viewport.panX) / viewport.zoom,
    y: centerY + (screenY - centerY - viewport.panY) / viewport.zoom,
  };
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
  // 앵커 아래의 기저 점은 확대해도 그대로다 — 그래서 이것이 곧 조준점이다.
  const aim = toBasePoint(viewport, anchorX, anchorY, centerX, centerY);

  // 앵커의 화면 위치가 불변이 되도록 pan을 역산한다.
  return {
    zoom: nextZoom,
    panX: anchorX - centerX - ratio * (anchorX - centerX - viewport.panX),
    panY: anchorY - centerY - ratio * (anchorY - centerY - viewport.panY),
    aimX: aim.x,
    aimY: aim.y,
  };
}

function touchDistance(touches: { pageX: number; pageY: number }[]): number {
  const [first, second] = touches;
  return Math.hypot(first.pageX - second.pageX, first.pageY - second.pageY);
}

export function useUniverseViewport({ width, height }: { width: number; height: number }) {
  // 아무것도 안 겨눈 처음의 조준점은 화면 한가운데다.
  const identity = useMemo<UniverseViewport>(
    () => ({ ...IDENTITY, aimX: width / 2, aimY: height / 2 }),
    [height, width],
  );
  const [viewport, setViewport] = useState<UniverseViewport>(identity);
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
  // 영역 높이만큼 어긋난 자리를 확대 중심으로 잡는다(확대할수록 장면이 밀려나고, 결국 초점이
  // 풀려 LOD가 열리지 않는다). 웹 휠 경로가 getBoundingClientRect를 빼는 것과 같은 보정이다.
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

  const reset = useCallback(() => setViewport(identity), [identity]);

  const apply = useCallback((next: UniverseViewport) => {
    setViewport(next);
  }, []);

  // 직전 값에서 이어서 계산해야 하는 변화(휠처럼 한 프레임에 여러 번 들어오는 것)는 반드시
  // 함수형으로 — ref를 읽으면 같은 프레임의 이벤트가 전부 같은 시작값을 써서 대부분이 삼켜진다
  // (트랙패드로 빠르게 굴리면 확대가 거의 안 되던 증상).
  const step = useCallback((reduce: (previous: UniverseViewport) => UniverseViewport) => {
    setViewport(reduce);
  }, []);

  // 특정 지점으로 날아간다 — 검색 결과나 '내 행성으로'가 쓸 진입점. 날아간 곳이 곧 조준점.
  const focusOn = useCallback((targetX: number, targetY: number, zoom: number) => {
    const nextZoom = clampZoom(zoom);
    setViewport({
      zoom: nextZoom,
      panX: -(targetX - width / 2) * nextZoom,
      panY: -(targetY - height / 2) * nextZoom,
      aimX: targetX,
      aimY: targetY,
    });
  }, [height, width]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    // 살짝의 흔들림은 탭으로 남긴다 — 천체를 누르는 동작을 뺏지 않기 위해.
    onMoveShouldSetPanResponder: (_event, gesture) => Math.hypot(gesture.dx, gesture.dy) > 6,
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
    // 화면은 이 셋을 캔버스 컨테이너 View에 그대로 달아야 한다 — 하나라도 빠지면 확대
    // 중심이 어긋난다(원점을 못 재거나, 웹 휠이 안 붙거나).
    containerRef,
    onContainerLayout: measureContainer,
  };
}
