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
  labelOpacity,
  placeChildren,
  placeOnMap,
  resolveProgress,
  smoothStep,
  UNIVERSE_ROOT_RADIUS,
  zoomToFrame,
  type SpacePlacement,
} from '@/features/universe/utils/universeSpace';
import { hasMapPoint, mapPointFor } from '@/features/universe/utils/koreaMapPositions';
import { projectPoint } from '@/features/universe/utils/universeProjection';
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
//
// 13 → 42 (2026-08-22). 천체를 폰에 맞게 키웠더니 첫 화면의 시/도가 이 문턱을 넘어 원반으로
// 넘어갔는데, 40px짜리 원반에 흩뿌린 입자 420개는 **덩어리로 안 읽힌다** — 실기기에서
// 이름표만 뜨고 그 아래가 텅 빈 것처럼 보인 원인이 이것이다(활동이 적은 지역은 입자마저
// 최저 밝기라 더 심했다). 나선 구조는 그게 실제로 보일 만큼 커졌을 때(반지름 ~23px부터
// 배어 나와 ~80px에서 완성) 나타나면 된다. 그전까지 지역은 하나의 빛 덩어리다.
const DISK_MIN_SCREEN_RADIUS = 42;
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
  // 우주 좌표의 깊이 — 그리로 날아갈 때 카메라를 같은 깊이로 옮기는 데 쓴다.
  universeZ: number;
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

// 배치 좌표도 캐시한다. 배치는 우주 좌표라 뷰포트와 무관한 순수 결정값인데, 걷기가 제스처
// 프레임마다 다시 도는 바람에 은하 하나가 수백 명이면 프레임마다 수천 번의 삼각함수와
// 그만큼의 할당이 통째로 버려지고 있었다(인당 1행성 이후 명부에 비례해 커지는 비용).
// 부모 배치가 같으면(값 비교) 그대로 쓴다 — 자식 데이터가 바뀌면 TreeEntry 자체가 바뀐다.
const placementCache = new WeakMap<TreeEntry, { parent: SpacePlacement; placements: SpacePlacement[] }>();

function placementsFor(
  entry: TreeEntry,
  placement: SpacePlacement,
  children: (UniverseBody | UniversePlanet)[],
): SpacePlacement[] {
  const cached = placementCache.get(entry);

  if (
    cached
    && cached.parent.x === placement.x
    && cached.parent.y === placement.y
    && cached.parent.z === placement.z
    && cached.parent.radius === placement.radius
  ) {
    return cached.placements;
  }

  const placements = placeChildrenOf(placement, children);
  placementCache.set(entry, { parent: placement, placements });
  return placements;
}

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

// 자식 배치 — 시/도처럼 실제 지도 자리가 있는 층은 그 자리에, 나머지는 궤도에.
// 걷기와 검색 착지가 **같은 함수**를 써야 엉뚱한 천체 앞에 내려앉지 않는다.
function placeChildrenOf(
  placement: SpacePlacement,
  children: (UniverseBody | UniversePlanet)[],
): SpacePlacement[] {
  const scales = children.map((child) => child.scale);
  const named = children.filter((child): child is UniverseBody => 'name' in child);
  const mappable = named.length === children.length
    && named.filter((child) => hasMapPoint(child.name)).length >= Math.ceil(children.length * 0.6);

  if (mappable) {
    return placeOnMap(placement, named.map((child) => mapPointFor(child.name)), scales);
  }

  // 행성 층은 크기 바닥을 끈다 — 크기 = 누적 거리 비율이 규칙이라, 배치가 다시 누르면
  // 항성(누적 1등)과 신입의 차이가 화면에서 뭉개진다. 서버 바닥(0.22)이 가시성을 지킨다.
  const planetLayer = children.length > 0 && 'userId' in children[0];

  return placeChildren(placement, scales, planetLayer ? { sizeFloor: 0 } : undefined);
}

function paletteForPlanet(planet: UniversePlanet): SkyOrb['palette'] {
  return planet.isStar ? 'star' : 'planet';
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
  // 확대 앵커 아래에 있는 천체의 깊이를 뷰포트에 알려준다 — 확대가 곧 그리로 다가가는
  // 일이 되려면 카메라가 어느 깊이로 들어가야 하는지 알아야 한다.
  const bodiesRef = useRef<SceneBody[]>([]);
  const depthAt = useCallback((screenX: number, screenY: number) => {
    let inside: SceneBody | null = null;
    let nearest: SceneBody | null = null;
    let nearestGap = Number.POSITIVE_INFINITY;

    for (const body of bodiesRef.current) {
      const distance = Math.hypot(body.screenX - screenX, body.screenY - screenY);

      // 겨눈 점을 품은 것 중 **가장 깊은** 것이 목표다.
      //
      // 표면까지의 거리로 고르면 안 된다: 화면을 통째로 덮은 조상(나라·시도)은 거리가 크게
      // 음수라 언제나 이기고, 그러면 확대할 때마다 카메라가 그 조상의 깊이로 도로 끌려간다.
      // "확대해도 중간에 안 가진다"가 정확히 이 증상이었다.
      if (distance <= body.screenRadius && (!inside || body.depth > inside.depth)) {
        inside = body;
      }

      const gap = distance - body.screenRadius;

      if (gap < nearestGap) {
        nearestGap = gap;
        nearest = body;
      }
    }

    // 빈 하늘이면 '가장 가까운 것'을 깊이의 길잡이로만 쓴다. 그 천체를 커서에 붙들면
    // 안 된다 — 엉뚱한 방향에 있는 천체가 커서에 고정되면서 화면 전체가 그쪽으로 끌려간다.
    // (오너 2026-08-16: "가고 싶은 곳을 중간에 두고 확대하는데 다른 방향으로 이동한다")
    const best = inside ?? nearest;

    return best
      ? { x: best.x, y: best.y, z: best.universeZ, onBody: best === inside }
      : null;
  }, []);

  const {
    viewport,
    fitZoom,
    focusOn,
    reset,
    panHandlers,
    containerRef,
    onContainerLayout,
  } = useUniverseViewport({ width, height, depthAt });

  const centerX = width / 2;
  const centerY = height / 2;
  const { zoom, panX, panY } = viewport;

  // 우주 좌표 → 화면 좌표. 원근 투영이라 깊이에 따라 크기와 자리가 함께 달라진다.
  // 3D 레이어는 여기서 나온 화면 좌표를 그대로 받아 그린다 — 투영이 두 벌이면 반드시 어긋난다.
  const project = useCallback(
    (x: number, y: number, z: number) => projectPoint(x, y, z, viewport, width, height),
    [height, viewport, width],
  );

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
      | { kind: 'planet'; planet: UniversePlanet; placement: SpacePlacement; depth: number }
      | {
        kind: 'region';
        nodeId: string;
        meta: { name: string; level: string; scale: number; brightness: number; isMine: boolean; averageDistanceKm: number };
        placement: SpacePlacement;
        depth: number;
      };
    const queue: Pending[] = [];

    // 화면 밖이거나 한 점도 안 되면 그 가지는 통째로 없는 셈 친다. 카메라 뒤로 넘어간
    // 것도 여기서 걸러진다(투영이 visible=false를 준다).
    const isVisible = (screenX: number, screenY: number, screenRadius: number) => {
      if (screenRadius < BODY_CULL_PX) {
        return false;
      }

      const footprint = screenRadius * CULL_FOOTPRINT_SCALE;

      return screenX + footprint >= 0
        && screenX - footprint <= width
        && screenY + footprint >= 0
        && screenY - footprint <= height;
    };

    const visitPlanet = (planet: UniversePlanet, placement: SpacePlacement, depth: number) => {
      const projected = project(placement.x, placement.y, placement.z);
      const screenRadius = placement.radius * projected.scale;

      if (!projected.visible || !isVisible(projected.screenX, projected.screenY, screenRadius)) {
        return;
      }

      const { screenX, screenY } = projected;
      // 가까울수록(투영 배율이 초점면보다 클수록) 밝다 — 사이의 먼지가 하는 일.
      const nearness = projected.scale / zoom;

      push({
        key: `planet:${planet.userId}`,
        nodeId: null,
        planet,
        name: planet.userName,
        detail: `이번 달 ${planet.monthDistanceKm}km`,
        x: placement.x,
        y: placement.y,
        universeZ: placement.z,
        radius: placement.radius,
        screenX,
        screenY,
        screenRadius,
        depth,
        z: Math.max(-1, Math.min(1, 1 - 1 / Math.max(0.2, nearness))) * DEPTH_SCREEN_SPAN,
        // 카메라 코앞이면 서서히 사라진다 — 근접 컷은 이진이라, 미리 옅어져 있지 않으면
        // 지나치는 순간 한 프레임에 툭 꺼진다.
        opacity: Math.max(0.5, Math.min(1, 0.5 + 0.5 * nearness)) * projected.nearFade,
        nameOpacity: projected.nearFade,
        morph: smoothStep(
          SPHERE_MIN_SCREEN_RADIUS * 0.55,
          SPHERE_MIN_SCREEN_RADIUS * 1.9,
          screenRadius,
        ),
        shape: 'sphere',
        palette: paletteForPlanet(planet),
        brightness: planet.brightness,
        isMine: planet.isMine,
      });
    };

    const visitRegion = (
      nodeId: string,
      meta: { name: string; level: string; scale: number; brightness: number; isMine: boolean; averageDistanceKm: number },
      placement: SpacePlacement,
      depth: number,
    ) => {
      const projected = project(placement.x, placement.y, placement.z);
      const screenRadius = placement.radius * projected.scale;
      // 카메라 **뒤**에 있는 것과 화면 **밖**에 있는 것은 전혀 다르다.
      //
      // 화면 밖이면 그 안의 것들도 화면 밖이니 가지 전체를 건너뛰어도 된다. 하지만 카메라가
      // 그 천체를 지나쳐 안으로 들어간 경우(=뒤에 있는 경우)는 그 안의 것들이 바로 눈앞에
      // 있다. 둘을 같이 잘라내는 바람에, 파고들면 지나친 부모와 함께 자식들까지 통째로
      // 사라져 허공만 남았다 — '내 행성으로'가 빈 공간에 내려놓던 것도 같은 이유다.
      const behindCamera = !projected.visible;


      if (!behindCamera && !isVisible(projected.screenX, projected.screenY, screenRadius)) {
        return;
      }

      const { screenX, screenY } = projected;
      const nearness = projected.scale / zoom;
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
      const progress = behindCamera
        // 이미 지나쳐 들어온 것은 완전히 풀린 상태다 — 그 안이 지금 눈앞에 있다.
        ? 1
        : children.length > 0
          ? resolveProgress(screenRadius)
          : resolveProgress(screenRadius) * 0.35;

      if (!behindCamera) {
        push({
        key: `node:${nodeId}`,
        nodeId,
        planet: null,
        name: meta.name,
        detail: `인당 ${meta.averageDistanceKm}km`,
        x: placement.x,
        y: placement.y,
        universeZ: placement.z,
        radius: placement.radius,
        screenX,
        screenY,
        screenRadius,
        depth,
        z: Math.max(-1, Math.min(1, 1 - 1 / Math.max(0.2, nearness))) * DEPTH_SCREEN_SPAN,
        // 14% 흔적도 카메라를 통과할 때는 미리 옅어져야 한다 — 근접 컷은 이진이라 페이드
        // 없이는 통과하는 프레임에 흔적이 통째로 툭 사라진다.
        opacity: cloudOpacity(progress) * Math.max(0.5, Math.min(1, 0.5 + 0.5 * nearness)) * projected.nearFade,
        nameOpacity: labelOpacity(progress) * projected.nearFade,
        morph: smoothStep(
          DISK_MIN_SCREEN_RADIUS * 0.55,
          DISK_MIN_SCREEN_RADIUS * 1.9,
          screenRadius,
        ),
        shape: 'disk',
        palette: paletteForRegion(meta.level),
        brightness: meta.brightness,
          isMine: meta.isMine,
        });
      }


      if (progress <= 0 || children.length === 0) {
        return;
      }

      const placements = placementsFor(entry as TreeEntry, placement, children);

      children.forEach((child, index) => {
        const childPlacement = placements[index];

        if (!childPlacement) {
          return;
        }

        if ('userId' in child) {
          queue.push({
            kind: 'planet',
            planet: child as UniversePlanet,
            placement: childPlacement,
            depth: depth + 1,
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
            isMine: body.isMine,
            averageDistanceKm: body.averageDistanceKm,
          },
          placement: childPlacement,
          depth: depth + 1,
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
        isMine: false,
        averageDistanceKm: rootEntry.node.averageDistanceKm,
      },
      placement: { x: 0, y: 0, z: 0, radius: UNIVERSE_ROOT_RADIUS },
      depth: 0,
    });

    // queue.shift()는 Hermes 배열에서 O(남은 길이)라 걷기 전체가 O(V²)였다 — 커서로 민다.
    let head = 0;

    while (head < queue.length && collected.length < MAX_BODIES) {
      const next = queue[head];
      head += 1;

      if (!next) {
        break;
      }

      if (next.kind === 'planet') {
        visitPlanet(next.planet, next.placement, next.depth);
      } else {
        visitRegion(next.nodeId, next.meta, next.placement, next.depth);
      }
    }

    return { bodies: collected, needed: wanted, focused: deepestAtCenter as SceneBody | null };
  }, [centerX, centerY, entryFor, height, project, revision, rootId, width, zoom]);

  // 렌더 중에 요청하지 않는다 — 부탁 목록만 모아두고 커밋 후에 보낸다. 목록은 매 렌더 새
  // 배열이라, 내용이 같으면 effect가 다시 돌지 않게 문자열로 묶어 비교한다.
  // revision을 같이 넣는 이유: 요청 목록이 그대로여도(같은 노드를 계속 원해도) 저장소 쪽에서
  // 무언가 바뀌면 다시 두드려야 한다. 특히 한 번 실패한 노드는 잠깐 쉬었다 다시 받아야 하는데,
  // 목록이 안 변하면 이 effect가 영영 다시 돌지 않아 그 지역만 영구히 비어 있었다.
  const neededKey = `${needed.join('|')}@${revision}`;
  const neededRef = useRef(needed);
  neededRef.current = needed;

  useEffect(() => {
    for (const nodeId of neededRef.current) {
      request(nodeId);
    }
  }, [neededKey, request]);

  bodiesRef.current = bodies;

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

      placement = placementsFor(entry, placement, siblings)[index];
      currentId = nextId;
    }

    // 사람까지 찍어 왔다면 그 행성 앞에 선다. 다만 못 찾아도 실패로 끝내지 않는다 —
    // 회원은 전원 자기 행성을 가지므로(인당 하나) 정상이라면 반드시 찾지만, 명부와 은하
    // 페이로드가 어긋나는 순간(캐시·동시 갱신)에도 검색이 죽은 것처럼 보이면 안 된다.
    // 적어도 그 동네까지는 간다.
    if (userId) {
      const entry = entryFor(currentId);
      const siblings = entry ? sortedChildren(entry) : [];
      const index = siblings.findIndex((child) => 'userId' in child && child.userId === userId);

      if (index >= 0 && entry) {
        placement = placementsFor(entry, placement, siblings)[index];
      }
    }

    focusOn(placement.x, placement.y, placement.z, zoomToFrame(placement.radius, width, height));
    return true;
  }, [entryFor, focusOn, height, rootId, width]);

  // 조종간은 **렌더 중에** 꽂는다. effect로 하면 flyTo가 새로 만들어질 때마다(캔버스 크기나
  // 최상위 노드가 바뀔 때마다) 정리 함수가 먼저 돌아 ref를 잠깐 비운다.
  //
  // 그 틈이 실제로 문제가 됐다: '내 행성으로'는 조상 데이터를 await한 뒤에야 조종간을
  // 부르는데, 그 사이 리렌더가 끼면 ref가 비어 있어 **아무 일도 안 일어난 채 조용히 끝났다**.
  // 확대를 많이 한 뒤일수록 리렌더가 잦아 더 자주 걸렸고, 새로고침 직후에는 멀쩡했다.
  if (controlsRef) {
    controlsRef.current = { flyTo, reset };
  }

  useEffect(() => () => {
    if (controlsRef) {
      controlsRef.current = null;
    }
  }, [controlsRef]);


  const orbs = useMemo<SkyOrb[]>(() => bodies.map((body) => ({
    id: body.key,
    // 이미 투영된 화면 좌표·화면 크기를 그대로 넘긴다. 3D 레이어는 변환하지 않는다.
    x: body.screenX,
    y: body.screenY,
    diameter: body.screenRadius * 2,
    screenDiameter: body.screenRadius * 2,
    depth: body.z,
    brightness: body.brightness,
    palette: body.palette,
    shape: body.shape,
    morph: body.morph,
    highlighted: body.isMine || body.key === selectedKey,
    // 골드는 '내 것'에만 — 고른 것은 얼음빛. 색 규율의 마지막 조각.
    highlightKind: body.isMine ? ('mine' as const) : ('selected' as const),
    opacity: body.opacity,
  })), [bodies, selectedKey]);

  // 이름은 큰 것부터 자리를 잡고, 겹치면 접는다. 확대하면 사이가 벌어져 접혔던 이름이 돌아온다.
  const labelled = useMemo(() => {
    // 화면을 통째로 덮는 배경 부모(깊이 줌에서 뒤에 깔린 시·도)는 이름표를 접는다 —
    // 그 이름표는 MAX_TOUCH_RADIUS 캡 탓에 화면 한가운데 떠서, 항성 이름 위에 겹쳐
    // '글자 씹힘'을 만들었다(오너 영상 2026-08-26). 몸통이 배경이 된 천체는 이미 하단
    // 브레드크럼/선택 카드가 이름을 말해준다. 고른 것만 예외.
    const backdropRadiusPx = Math.min(width, height) * 0.75;
    const sorted = bodies
      .filter((body) => body.screenRadius >= BODY_LABEL_PX && body.nameOpacity > 0.06)
      .filter((body) => body.screenRadius < backdropRadiusPx || body.key === selectedKey)
      .sort((left, right) => right.screenRadius - left.screenRadius);
    // 나라 전체가 보이는 거리에서는 이름을 성좌의 캡션처럼 소수만 남긴다 — 첫 화면이
    // 통계 대시보드 40칸으로 읽히면 우주가 아니라 관리 화면이 된다.
    const candidates = zoom < fitZoom * 1.5 ? sorted.slice(0, 14) : sorted;

    // 고른 것·조준한 것은 **우선권을 갖고 충돌 검사에 참여한다** — 예전엔 검사를 통째로
    // 건너뛰고 뒤에 덧붙여서, 이미 자리 잡은 이름표 위에 그대로 겹쳤다(글자 씹힘의 두
    // 번째 뿌리). 먼저 놓인 상자가 이기는 픽커 규칙이므로, 앞에 세우면 강제 표시와 충돌
    // 회피가 동시에 성립한다.
    const forcedKeys = new Set([selectedKey, focused?.key].filter(Boolean));
    const forced = bodies.filter((body) => forcedKeys.has(body.key));
    const ordered = [
      ...forced,
      ...candidates.filter((body) => !forcedKeys.has(body.key)),
    ];

    const visible = pickVisibleLabels(
      ordered.map((body) => ({
        id: body.key,
        centerX: body.screenX,
        top: body.screenY + Math.min(body.screenRadius, MAX_TOUCH_RADIUS) + 4,
        width: labelWidthFor(body.name),
        // 고른 것은 이름 아래 상세 줄(인당/이번 달 km)까지 두 줄이다 — 한 줄 높이로
        // 검사하면 상세 줄 위에 다른 이름표가 얹힌다(글자 씹힘의 세 번째 뿌리).
        height: body.key === selectedKey ? LABEL_HEIGHT * 2 : LABEL_HEIGHT,
      })),
      width,
      height,
    );

    // 강제 표시는 충돌 결과와 무관하게 살아남는다(우선권이라 밀릴 일도 없지만, 화면 밖
    // 판정 등으로 빠져도 이름은 붙어야 한다 — 검색 도착이 실패로 읽히면 안 된다).
    return ordered.filter((body) => visible.has(body.key) || forcedKeys.has(body.key));
  }, [bodies, fitZoom, focused, height, selectedKey, width, zoom]);

  // 누를 수 있는 것: 이름이 붙은 것 + 고른 것. 전부에 터치 영역을 두면 뒤에 깔린 거대한
  // 부모가 앞의 작은 천체를 가로챈다.
  const touchable = useMemo(() => {
    const keys = new Set(labelled.map((body) => body.key));

    return bodies
      .filter((body) => keys.has(body.key) || body.key === selectedKey)
      // 작은 것이 위에 오도록 — 깊은 것이 얕은 것보다 먼저 눌린다.
      .sort((left, right) => left.depth - right.depth);
  }, [bodies, labelled, selectedKey]);


  const handlePress = useCallback((body: SceneBody) => {
    // 한 번 누르면 정보, 이미 고른 것을 다시 누르면 그리로 날아간다.
    if (body.key === selectedKey) {
      focusOn(body.x, body.y, body.universeZ, zoomToFrame(body.radius, width, height));
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
              // 고른 것·조준한 것은 문턱과 무관하게 읽혀야 하므로 바닥을 깐다.
              opacity: Math.max(
                body.key === selectedKey || body.key === focused?.key ? 0.92 : 0,
                body.nameOpacity * smoothStep(BODY_LABEL_PX, BODY_LABEL_PX * 1.8, body.screenRadius),
              ),
            },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.name} numberOfLines={1}>
            {body.name}
          </Text>
          {/* 숫자는 고른 것에만 — 나머지 이름표는 캡션이다. 모든 천체가 통계를 달고 있으면
              박물관이 아니라 관리 대시보드가 된다. */}
          {body.key === selectedKey ? (
            <Text style={styles.detail} numberOfLines={1}>
              {body.detail}
            </Text>
          ) : null}
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
  // 박물관 명판의 문법: 가는 굵기 + 자간 + 상자 없는 그림자. 굵은 흰 글씨는 하늘 위에
  // '떠 있는 UI'로 읽히고, 그림자가 있어야 별밭 위에서도 상자 없이 글자가 선다.
  name: {
    color: 'rgba(230, 238, 252, 0.92)',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.4,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  detail: {
    color: 'rgba(150, 168, 204, 0.6)',
    fontSize: 10,
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
});

export const UniverseScene = memo(UniverseSceneComponent);
