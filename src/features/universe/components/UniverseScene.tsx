import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { UniverseCanvas } from '@/features/universe/three/UniverseCanvas';
import type { SkyOrb } from '@/features/universe/three/UniverseSky';
import { useUniverseViewport } from '@/features/universe/hooks/useUniverseViewport';
import type { TreeEntry } from '@/features/universe/hooks/useUniverseTree';
import { pickVisibleLabels } from '@/features/universe/utils/universeLayout';
import {
  BODY_CULL_PX,
  BODY_LABEL_PX,
  BODY_RESOLVE_PX,
  cloudOpacity,
  depthDimFor,
  depthScaleFor,
  labelOpacity,
  placeChildren,
  resolveProgress,
  smoothStep,
  UNIVERSE_ROOT_RADIUS,
  zoomToFrame,
  type SpacePlacement,
} from '@/features/universe/utils/universeSpace';
import type { UniverseBody, UniversePlanet } from '@/lib/api/types';

// 하나의 연속된 우주 (오너 2026-08-16: "확대한다고 전환되는 게 아니라, 뭉쳐 있던 게 점점
// 커지면서 풀리는 것").
//
// 화면이 하나뿐이다. 대한민국 → 시/도 → 시/군/구 → 회원이 전부 같은 공간에 겹겹이 들어 있고,
// 확대는 카메라를 가까이 가져갈 뿐이다. 어떤 천체든 화면에서 커지면 그 안이 비치기 시작하고,
// 더 커지면 뭉침은 흔적만 남고 안의 것들이 주인공이 된다. 층을 갈아끼우지 않으므로
// 브레드크럼도, 되돌아가기도, 전환 로딩도 없다.

// 이보다 작게 보이면 나선 대신 발광 스프라이트 한 장으로 그린다 — 이 크기에서는 어차피
// 점으로 뭉개지고, 한 화면에 수백 개가 떠 있을 수 있다.
const DISK_MIN_SCREEN_RADIUS = 13;
// 행성도 마찬가지다. 이보다 작으면 구체(정점 1089개)를 만들 이유가 없다 — 몇 픽셀짜리
// 점에 조명을 계산하는 셈이라, 한 화면에 수백 개가 뜨면 그것만으로 프레임이 무너진다.
const SPHERE_MIN_SCREEN_RADIUS = 7;
// 실제로 그려지는 범위는 천체 반지름보다 훨씬 넓다(후광·나선 팔이 몇 배로 퍼진다). 잘라낼
// 때 이 배수만큼 여유를 두지 않으면, 화면 밖으로 나가는 순간 팔과 후광이 통째로 사라져
// 가장자리에서 툭툭 끊긴다.
const CULL_FOOTPRINT_SCALE = 7;
// 누를 수 있는 최소 크기와, 그 상한. 상한이 없으면 화면을 덮은 거대한 천체의 터치 영역이
// 빈 하늘까지 삼켜 아무 데나 눌러도 그리로 날아간다.
const MIN_TOUCH_RADIUS = 18;
const MAX_TOUCH_RADIUS = 72;
// 앞뒤 간격(화면 단위). 겹친 천체의 가림 순서를 정하는 데만 쓰므로 클 필요가 없다 —
// 크게 잡으면 배율이 곱해져 카메라의 깊이 범위를 넘는다.
const DEPTH_SCREEN_SPAN = 26;
// 한 프레임에 그리는 천체 수 상한 — 배율에 따라 수천 개가 후보가 될 수 있다.
const MAX_BODIES = 520;
// 이름표 크기. LABEL_BOX_WIDTH는 실제로 그려지는 상자의 폭(가장 긴 지역명이 안 잘리는
// 크기), 나머지 둘은 겹침 판정에 쓰는 어림값 — 이름 길이에 따라 실제 차지하는 폭이 다르다.
const LABEL_BOX_WIDTH = 116;
const LABEL_CHAR_WIDTH = 12;
const LABEL_MAX_WIDTH = 108;
const LABEL_HEIGHT = 28;

export type UniverseSceneControls = {
  // 경로대로 날아간다. 조상 데이터가 아직이면 false — 호출자가 채운 뒤 다시 부른다.
  flyTo: (path: string[], userId?: string) => boolean;
  // 나라 전체가 보이는 처음 자리로. 끌다가 우주 밖으로 나갔을 때의 유일한 귀환 수단이다.
  reset: () => void;
};

export type SceneBody = {
  key: string;
  nodeId: string | null;
  planet: UniversePlanet | null;
  name: string;
  detail: string;
  // 우주 좌표.
  x: number;
  y: number;
  radius: number;
  screenX: number;
  screenY: number;
  screenRadius: number;
  // 트리 깊이(층). 화면 한가운데를 품은 '가장 깊은' 것을 고르는 데 쓴다.
  depth: number;
  // 앞뒤 깊이(화면 단위) — 겹칠 때 누가 가리는지.
  z: number;
  opacity: number;
  nameOpacity: number;
  // 먼 빛 한 점(0) ↔ 완전한 모습(1) 사이의 위치.
  morph: number;
  shape: SkyOrb['shape'];
  palette: SkyOrb['palette'];
  brightness: number;
  isMine: boolean;
  stars: number;
};

function labelWidthFor(name: string) {
  return Math.min(LABEL_MAX_WIDTH, name.length * LABEL_CHAR_WIDTH + 6);
}

function paletteForRegion(level: string): SkyOrb['palette'] {
  return level === 'galaxy' ? 'galaxy' : 'group';
}

// 배치 순서 = 크기 순. 한 번 계산해 캐시한다 — 이 정렬이 매 렌더 새 배열을 만들면 그 아래
// 좌표가 전부 새로 계산되고, 배율이 조금만 바뀌어도 우주 전체가 다시 그려진다.
const childOrderCache = new WeakMap<TreeEntry, (UniverseBody | UniversePlanet)[]>();

function sortedChildren(entry: TreeEntry): (UniverseBody | UniversePlanet)[] {
  const cached = childOrderCache.get(entry);

  if (cached) {
    return cached;
  }

  const source: (UniverseBody | UniversePlanet)[] = entry.bodies.length > 0 ? entry.bodies : entry.planets;
  const ordered = [...source].sort((left, right) => {
    if (right.scale !== left.scale) {
      return right.scale - left.scale;
    }

    const leftKey = 'id' in left ? left.id : left.userId;
    const rightKey = 'id' in right ? right.id : right.userId;
    return leftKey.localeCompare(rightKey);
  });

  childOrderCache.set(entry, ordered);
  return ordered;
}

function paletteForPlanet(planet: UniversePlanet): SkyOrb['palette'] {
  if (planet.isStar) {
    return 'star';
  }

  return planet.isProtostar ? 'protostar' : 'planet';
}

function UniverseSceneComponent({
  rootId,
  entryFor,
  request,
  revision,
  width,
  height,
  selectedKey,
  onSelect,
  onFocusChange,
  controlsRef,
}: {
  rootId: string | null;
  entryFor: (nodeId: string) => TreeEntry | null;
  request: (nodeId: string) => void;
  // 새 자식이 도착하면 바뀌는 값 — 이게 있어야 화면이 다시 걸어 내려간다.
  revision: number;
  width: number;
  height: number;
  selectedKey: string | null;
  onSelect: (body: SceneBody | null) => void;
  // 화면 한가운데를 품은 가장 깊은 천체 — 아래 카드가 "지금 어디인지"를 보여준다.
  onFocusChange: (body: SceneBody | null) => void;
  // 화면 위쪽 버튼들이 카메라를 부리는 통로 — 검색 착지, '내 행성으로', 처음 자리로.
  controlsRef?: { current: UniverseSceneControls | null };
}) {
  const {
    viewport,
    fitZoom,
    focusOn,
    reset,
    panHandlers,
    containerRef,
    onContainerLayout,
  } = useUniverseViewport({ width, height });

  const centerX = width / 2;
  const centerY = height / 2;
  const { zoom, panX, panY } = viewport;

  // 우주 좌표 → 화면 좌표. 3D 레이어의 group 변환과 같은 식이어야 이름이 천체를 벗어나지 않는다.
  const toScreenX = useCallback((x: number) => centerX + x * zoom + panX, [centerX, panX, zoom]);
  const toScreenY = useCallback((y: number) => centerY + y * zoom + panY, [centerY, panY, zoom]);

  // 공간을 걸어 내려가며 지금 보이는 것만 모은다. 자식은 항상 부모 원 안에 있으므로, 부모가
  // 화면 밖이면 그 가지 전체를 건너뛸 수 있다 — 이게 전국 규모를 감당하는 유일한 이유다.
  //
  // 너비 우선으로 걷는다. 자식은 언제나 부모보다 작으므로 큰 것부터 차례로 나오고, 예산이
  // 바닥나 잘릴 때 잘리는 쪽이 항상 '가장 작은 것들'이 된다. 깊이 우선이면 한 가지를 끝까지
  // 파고들다 예산을 다 써서, 화면 절반이 통째로 비어 보이는 일이 생긴다.
  const { bodies, needed, focused } = useMemo(() => {
    const collected: SceneBody[] = [];
    const wanted: string[] = [];
    let deepestAtCenter: SceneBody | null = null;

    if (!rootId || width <= 0 || height <= 0) {
      return { bodies: collected, needed: wanted, focused: null as SceneBody | null };
    }

    const rootEntry = entryFor(rootId);

    if (!rootEntry) {
      return { bodies: collected, needed: wanted, focused: null as SceneBody | null };
    }

    const push = (body: SceneBody) => {
      collected.push(body);

      if (
        Math.hypot(body.screenX - centerX, body.screenY - centerY) <= body.screenRadius
        && (!deepestAtCenter || body.depth > deepestAtCenter.depth)
      ) {
        deepestAtCenter = body;
      }
    };

    // 다음에 걸어갈 곳들 — 큰 것부터 차례로 빠져나간다(너비 우선).
    type Pending =
      | { kind: 'planet'; planet: UniversePlanet; placement: SpacePlacement; depth: number; near: number }
      | {
        kind: 'region';
        nodeId: string;
        meta: { name: string; level: string; scale: number; brightness: number; stars: number; isMine: boolean; averageDistanceKm: number };
        placement: SpacePlacement;
        depth: number;
        // 부모 대비 앞뒤 정도 — 원근(크기·밝기)을 여기서 뽑는다.
        near: number;
      };
    const queue: Pending[] = [];

    // 화면 밖이거나 한 점도 안 되면 그 가지는 통째로 없는 셈 친다.
    const isVisible = (placement: SpacePlacement, screenRadius: number) => {
      if (screenRadius < BODY_CULL_PX) {
        return false;
      }

      const screenX = toScreenX(placement.x);
      const screenY = toScreenY(placement.y);
      const footprint = screenRadius * CULL_FOOTPRINT_SCALE;

      return screenX + footprint >= 0
        && screenX - footprint <= width
        && screenY + footprint >= 0
        && screenY - footprint <= height;
    };

    const visitPlanet = (
      planet: UniversePlanet,
      placement: SpacePlacement,
      depth: number,
      near: number,
    ) => {
      const perspective = depthScaleFor(near);
      const screenRadius = placement.radius * zoom * perspective;

      if (!isVisible(placement, screenRadius)) {
        return;
      }

      const screenX = toScreenX(placement.x);
      const screenY = toScreenY(placement.y);

      push({
        key: `planet:${planet.userId}`,
        nodeId: null,
        planet,
        name: planet.userName,
        detail: `이번 달 ${planet.monthDistanceKm}km`,
        x: placement.x,
        y: placement.y,
        radius: placement.radius,
        screenX,
        screenY,
        screenRadius,
        depth,
        z: near * DEPTH_SCREEN_SPAN,
        opacity: depthDimFor(perspective),
        nameOpacity: 1,
        morph: smoothStep(
          SPHERE_MIN_SCREEN_RADIUS * 0.55,
          SPHERE_MIN_SCREEN_RADIUS * 1.9,
          screenRadius,
        ),
        shape: 'sphere',
        palette: paletteForPlanet(planet),
        brightness: planet.brightness,
        isMine: planet.isMine,
        stars: planet.stars,
      });
    };

    const visitRegion = (
      nodeId: string,
      meta: { name: string; level: string; scale: number; brightness: number; stars: number; isMine: boolean; averageDistanceKm: number },
      placement: SpacePlacement,
      depth: number,
      near: number,
    ) => {
      const perspective = depthScaleFor(near);
      const screenRadius = placement.radius * zoom * perspective;

      if (!isVisible(placement, screenRadius)) {
        return;
      }

      const screenX = toScreenX(placement.x);
      const screenY = toScreenY(placement.y);
      const entry = entryFor(nodeId);

      // 풀릴 만큼 커졌는데 아직 안이 없으면 그때 부탁한다 — 보이지도 않는 것을 미리 받지 않는다.
      if (screenRadius >= BODY_RESOLVE_PX && !entry) {
        wanted.push(nodeId);
      }

      // 큰 것부터 — placeChildren이 첫째를 한가운데에 앉히므로 순서가 곧 배치다. 동점은
      // id로 갈라 매 렌더 같은 자리에 오게 한다(순서가 흔들리면 별이 자리를 바꿔 튄다).
      const children = entry ? sortedChildren(entry) : [];
      // 안이 아직 안 왔으면 옅어지다 만다 — 다 왔다는 듯 사라졌다가 자식이 도착하는 순간
      // 화면이 튀는 대신, 절반쯤 흐려진 채 기다리다 자연스럽게 이어진다.
      const progress = children.length > 0
        ? resolveProgress(screenRadius)
        : resolveProgress(screenRadius) * 0.35;

      push({
        key: `node:${nodeId}`,
        nodeId,
        planet: null,
        name: meta.name,
        detail: `인당 ${meta.averageDistanceKm}km`,
        x: placement.x,
        y: placement.y,
        radius: placement.radius,
        screenX,
        screenY,
        screenRadius,
        depth,
        z: near * DEPTH_SCREEN_SPAN,
        opacity: cloudOpacity(progress) * depthDimFor(perspective),
        nameOpacity: labelOpacity(progress),
        morph: smoothStep(
          DISK_MIN_SCREEN_RADIUS * 0.55,
          DISK_MIN_SCREEN_RADIUS * 1.9,
          screenRadius,
        ),
        shape: 'disk',
        palette: paletteForRegion(meta.level),
        brightness: meta.brightness,
        isMine: meta.isMine,
        stars: meta.stars,
      });

      if (progress <= 0 || children.length === 0) {
        return;
      }

      const placements = placeChildren(placement, children.map((child) => child.scale));

      children.forEach((child, index) => {
        const childPlacement = placements[index];

        if (!childPlacement) {
          return;
        }

        // 부모 반지름으로 정규화한 앞뒤 — 어느 층에서 보든 깊이감이 같아야 한다.
        const childNear = placement.radius > 0
          ? (childPlacement.z - placement.z) / placement.radius
          : 0;

        if ('userId' in child) {
          queue.push({
            kind: 'planet',
            planet: child as UniversePlanet,
            placement: childPlacement,
            depth: depth + 1,
            near: childNear,
          });
          return;
        }

        const body = child as UniverseBody;
        queue.push({
          kind: 'region',
          nodeId: body.id,
          meta: {
            name: body.name,
            level: body.level,
            scale: body.scale,
            brightness: body.brightness,
            stars: body.stars,
            isMine: body.isMine,
            averageDistanceKm: body.averageDistanceKm,
          },
          placement: childPlacement,
          depth: depth + 1,
          near: childNear,
        });
      });
    };

    queue.push({
      kind: 'region',
      nodeId: rootId,
      meta: {
        name: rootEntry.node.name,
        level: rootEntry.node.level,
        scale: 1,
        brightness: 1,
        stars: rootEntry.node.stars,
        isMine: false,
        averageDistanceKm: rootEntry.node.averageDistanceKm,
      },
      placement: { x: 0, y: 0, z: 0, radius: UNIVERSE_ROOT_RADIUS },
      depth: 0,
      near: 0,
    });

    while (queue.length > 0 && collected.length < MAX_BODIES) {
      const next = queue.shift();

      if (!next) {
        break;
      }

      if (next.kind === 'planet') {
        visitPlanet(next.planet, next.placement, next.depth, next.near);
      } else {
        visitRegion(next.nodeId, next.meta, next.placement, next.depth, next.near);
      }
    }

    return { bodies: collected, needed: wanted, focused: deepestAtCenter as SceneBody | null };
  }, [centerX, centerY, entryFor, height, revision, rootId, toScreenX, toScreenY, width, zoom]);

  // 렌더 중에 요청하지 않는다 — 부탁 목록만 모아두고 커밋 후에 보낸다. 목록은 매 렌더 새
  // 배열이라, 내용이 같으면 effect가 다시 돌지 않게 문자열로 묶어 비교한다.
  const neededKey = needed.join('|');
  const neededRef = useRef(needed);
  neededRef.current = needed;

  useEffect(() => {
    for (const nodeId of neededRef.current) {
      request(nodeId);
    }
  }, [neededKey, request]);

  const focusedKey = focused?.key ?? null;
  const onFocusChangeRef = useRef(onFocusChange);
  onFocusChangeRef.current = onFocusChange;
  const focusedRef = useRef<SceneBody | null>(null);
  focusedRef.current = focused;

  useEffect(() => {
    onFocusChangeRef.current(focusedRef.current);
  }, [focusedKey]);

  // 경로(최상위 → 목적지)를 따라 좌표를 재구성해 그리로 날아간다. 좌표는 부모 안에서만
  // 정해지므로 조상이 하나라도 없으면 계산할 수 없다 — 그때는 실패를 알려 호출자가 데이터를
  // 채운 뒤 다시 부르게 한다.
  const flyTo = useCallback((path: string[], userId?: string): boolean => {
    if (!rootId || path.length === 0 || width <= 0 || height <= 0) {
      return false;
    }

    let placement: SpacePlacement = { x: 0, y: 0, z: 0, radius: UNIVERSE_ROOT_RADIUS };
    let currentId = rootId;

    // 배치와 **같은 순서**로 재구성해야 한다 — 정렬이 어긋나면 엉뚱한 천체 앞에 착지한다.
    for (const nextId of path.slice(1)) {
      const entry = entryFor(currentId);

      if (!entry) {
        return false;
      }

      const siblings = sortedChildren(entry);
      const index = siblings.findIndex((child) => 'id' in child && child.id === nextId);

      if (index < 0) {
        return false;
      }

      placement = placeChildren(placement, siblings.map((child) => child.scale))[index];
      currentId = nextId;
    }

    // 사람까지 찍어 왔다면 그 행성 앞에 선다. 다만 못 찾아도 실패로 끝내지 않는다: 백엔드는
    // 한 은하에 그릴 행성 수를 제한하고 나머지를 성운으로 접는데(universeBuilder의
    // PLANET_RENDER_CAP), 검색은 명부 전체를 뒤지므로 접힌 사람이 결과로 나올 수 있다.
    // 그때 아무 일도 안 일어나면 검색이 고장 난 것처럼 보인다 — 적어도 그 동네까지는 간다.
    if (userId) {
      const entry = entryFor(currentId);
      const siblings = entry ? sortedChildren(entry) : [];
      const index = siblings.findIndex((child) => 'userId' in child && child.userId === userId);

      if (index >= 0) {
        placement = placeChildren(placement, siblings.map((child) => child.scale))[index];
      }
    }

    focusOn(placement.x, placement.y, zoomToFrame(placement.radius, width, height));
    return true;
  }, [entryFor, focusOn, height, rootId, width]);

  useEffect(() => {
    if (controlsRef) {
      controlsRef.current = { flyTo, reset };
    }

    return () => {
      if (controlsRef) {
        controlsRef.current = null;
      }
    };
  }, [controlsRef, flyTo, reset]);


  const orbs = useMemo<SkyOrb[]>(() => bodies.map((body) => ({
    id: body.key,
    x: centerX + body.x,
    y: centerY + body.y,
    // 3D 레이어는 배율 1 기준 값을 받고 그룹이 통째로 확대한다 — 원근으로 커진 몫만
    // 여기서 되돌려 넣는다.
    diameter: (body.screenRadius / zoom) * 2,
    screenDiameter: body.screenRadius * 2,
    // 그룹이 z에도 배율을 곱하므로 미리 나눠 둔다.
    depth: body.z / zoom,
    brightness: body.brightness,
    palette: body.palette,
    shape: body.shape,
    morph: body.morph,
    highlighted: body.isMine || body.key === selectedKey,
    opacity: body.opacity,
  })), [bodies, centerX, selectedKey, zoom]);

  // 이름은 큰 것부터 자리를 잡고, 겹치면 접는다. 확대하면 사이가 벌어져 접혔던 이름이 돌아온다.
  const labelled = useMemo(() => {
    const candidates = bodies
      .filter((body) => body.screenRadius >= BODY_LABEL_PX && body.nameOpacity > 0.06)
      .sort((left, right) => right.screenRadius - left.screenRadius);

    const visible = pickVisibleLabels(
      candidates.map((body) => ({
        id: body.key,
        centerX: body.screenX,
        top: body.screenY + Math.min(body.screenRadius, MAX_TOUCH_RADIUS) + 4,
        width: labelWidthFor(body.name),
        height: LABEL_HEIGHT,
      })),
      width,
      height,
    );

    return candidates.filter((body) => visible.has(body.key));
  }, [bodies, height, width]);

  // 누를 수 있는 것: 이름이 붙은 것 + 고른 것. 전부에 터치 영역을 두면 뒤에 깔린 거대한
  // 부모가 앞의 작은 천체를 가로챈다.
  const touchable = useMemo(() => {
    const keys = new Set(labelled.map((body) => body.key));

    return bodies
      .filter((body) => keys.has(body.key) || body.key === selectedKey)
      // 작은 것이 위에 오도록 — 깊은 것이 얕은 것보다 먼저 눌린다.
      .sort((left, right) => left.depth - right.depth);
  }, [bodies, labelled, selectedKey]);

  const labelledKeys = useMemo(() => new Set(labelled.map((body) => body.key)), [labelled]);

  const handlePress = useCallback((body: SceneBody) => {
    // 한 번 누르면 정보, 이미 고른 것을 다시 누르면 그리로 날아간다.
    if (body.key === selectedKey) {
      focusOn(body.x, body.y, zoomToFrame(body.radius, width, height));
      return;
    }

    onSelect(body);
  }, [focusOn, height, onSelect, selectedKey, width]);

  return (
    <View
      style={[styles.canvas, { width, height }]}
      ref={containerRef as never}
      onLayout={onContainerLayout}
      {...panHandlers}
    >
      <UniverseCanvas
        orbs={orbs}
        width={width}
        height={height}
        zoom={zoom}
        panX={panX}
        panY={panY}
        zoomFactor={zoom / fitZoom}
      />

      {/* 누를 자리 — 천체 위에 얹는 투명한 상자. 이름과 분리해 둔다: 예전엔 이름이 이 상자
          안에 들어 있어서 상자 폭에 맞춰 잘렸고, 작은 천체는 '서울특별시'가 '서울…'이 됐다. */}
      {touchable.map((body) => {
        const touchRadius = Math.min(
          MAX_TOUCH_RADIUS,
          Math.max(MIN_TOUCH_RADIUS, body.screenRadius),
        );

        return (
          <Pressable
            key={body.key}
            onPress={() => handlePress(body)}
            style={[
              styles.touch,
              {
                width: touchRadius * 2,
                height: touchRadius * 2,
                left: body.screenX - touchRadius,
                top: body.screenY - touchRadius,
              },
            ]}
          />
        );
      })}

      {labelled.map((body) => (
        <View
          key={`label:${body.key}`}
          style={[
            styles.label,
            {
              left: body.screenX - LABEL_BOX_WIDTH / 2,
              top: body.screenY + Math.min(body.screenRadius, MAX_TOUCH_RADIUS) + 4,
              // 이름도 서서히 켜진다 — 문턱을 넘는 순간 튀어나오면 확대가 끊겨 보인다.
              opacity: body.nameOpacity * smoothStep(BODY_LABEL_PX, BODY_LABEL_PX * 1.8, body.screenRadius),
            },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.name} numberOfLines={1}>
            {body.name}
            {body.stars > 0 ? ` ★${body.stars}` : ''}
          </Text>
          <Text style={styles.detail} numberOfLines={1}>
            {body.detail}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    position: 'relative',
    overflow: 'hidden',
  },
  touch: {
    position: 'absolute',
  },
  label: {
    position: 'absolute',
    width: LABEL_BOX_WIDTH,
    alignItems: 'center',
  },
  name: {
    color: 'rgba(238, 244, 255, 0.94)',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  detail: {
    color: 'rgba(170, 190, 225, 0.78)',
    fontSize: 10,
    textAlign: 'center',
  },
});

export const UniverseScene = memo(UniverseSceneComponent);
