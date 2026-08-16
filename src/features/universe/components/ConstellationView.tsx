import { memo, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { UniverseCanvas } from '@/features/universe/three/UniverseCanvas';
import type { SkyOrb } from '@/features/universe/three/UniverseSky';
import { useUniverseViewport } from '@/features/universe/hooks/useUniverseViewport';
import { useNodeInterior } from '@/features/universe/hooks/useNodeInterior';
import {
  computeLodReveal,
  isWithinCommitRadius,
  LOD_ASCEND_ZOOM,
  LOD_COMMIT_ZOOM,
  LOD_FOCUS_RADIUS_RATIO,
  resolveFocusedBody,
  resolveLodOpacity,
} from '@/features/universe/utils/universeLod';
import {
  buildOrbitSlots,
  countRings,
  pickVisibleLabels,
  ringRadius,
} from '@/features/universe/utils/universeLayout';
import type { UniverseBody } from '@/lib/api/types';

// 은하단·은하군 화면 — 자식 천체를 동심 궤도에 앉힌다. 여기서는 궤도를 돌리지 않는다:
// 이 층은 이름을 읽고 눌러 들어가는 화면이라 가만히 있는 편이 읽기 쉽다. 도는 건 은하
// 내부(행성)에서만 한다.

const BASE_DIAMETER = 26;
const LABEL_SLOT_WIDTH = 96;
// 이름표가 실제로 차지하는 크기(이름 + 수치 두 줄). 겹침 판정에만 쓴다.
//
// 폭은 이름 길이로 어림한다 — 한 값으로 고정하면 '서울특별시'가 '전북특별자치도'만큼
// 넓다고 보고 안 겹치는 이름까지 접어버린다.
const LABEL_CHAR_WIDTH = 12;
const LABEL_TEXT_MAX_WIDTH = 96;
const LABEL_TEXT_HEIGHT = 28;

function labelWidthFor(name: string) {
  return Math.min(LABEL_TEXT_MAX_WIDTH, name.length * LABEL_CHAR_WIDTH + 6);
}

function ConstellationViewComponent({
  bodies,
  width,
  height,
  onSelect,
  onZoomEnter,
  onAscend,
}: {
  bodies: UniverseBody[];
  width: number;
  height: number;
  // 눌러서 들어가기.
  onSelect: (body: UniverseBody) => void;
  // 확대해서 들어가기 — 탭과 분리해 둔다. 관성 스크롤 한 번이 여러 층을 뚫는 걸 막는
  // 쿨다운이 이쪽에만 걸리고, 손가락으로 누른 것은 언제나 즉시 반응해야 하기 때문이다.
  onZoomEnter: (body: UniverseBody) => void;
  onAscend?: () => void;
}) {
  // 크기 큰 순으로 안쪽 궤도부터 — 중심에 가까울수록 잘 달린 동네다.
  const ordered = useMemo(
    () => [...bodies].sort((left, right) => right.scale - left.scale),
    [bodies],
  );
  const slots = useMemo(() => buildOrbitSlots(ordered.length), [ordered.length]);
  const ringCount = useMemo(() => countRings(slots), [slots]);
  const maxRadius = Math.max(0, Math.min(width, height) / 2 - 54);
  // 확대/축소·이동 (오너 2026-08-15). 3D와 레이블이 이 하나의 값을 공유한다.
  const {
    viewport,
    reset,
    panHandlers,
    containerRef,
    onContainerLayout,
  } = useUniverseViewport({ width, height });
  // screen = (base - center) * zoom + center + pan — UniverseSky의 group 변환과 같은 식.
  const project = (baseX: number, baseY: number) => ({
    x: (baseX - width / 2) * viewport.zoom + width / 2 + viewport.panX,
    y: (baseY - height / 2) * viewport.zoom + height / 2 + viewport.panY,
  });

  // 3D 레이어가 받을 천체 명세 — RN 레이어와 완전히 같은 좌표를 쓴다(두 벌이 어긋나면
  // 레이블이 천체를 벗어난다). 여기서 계산해 두고, 아래 Pressable은 같은 식을 재사용한다.
  const skyOrbs = useMemo<SkyOrb[]>(() => ordered.flatMap((body, index) => {
    const slot = slots[index];

    if (!slot) {
      return [];
    }

    const radius = ringRadius(slot.ring, ringCount, maxRadius);
    const diameter = BASE_DIAMETER * body.scale;

    return [{
      id: body.id,
      x: width / 2 + slot.unitX * radius,
      y: height / 2 + slot.unitY * radius,
      diameter,
      brightness: body.brightness,
      palette: (body.level === 'group' ? 'group' : 'galaxy') as 'group' | 'galaxy',
      highlighted: body.isMine,
    }];
  }), [height, maxRadius, ordered, ringCount, slots, width]);


  // --- LOD: 확대가 깊어지면 화면 중앙 은하가 그 자리에서 풀린다 (universeLod) ---
  const reveal = computeLodReveal(viewport.zoom);
  // 판정은 전부 기저 좌표에서, 조준점(마지막으로 확대한 지점) 기준으로 한다.
  const focused = reveal <= 0 ? null : resolveFocusedBody(
    skyOrbs.map((orb) => ({ id: orb.id, baseX: orb.x, baseY: orb.y })),
    viewport.aimX,
    viewport.aimY,
    Math.min(width, height) * LOD_FOCUS_RADIUS_RATIO,
  );
  const focusedBodyId = focused?.id ?? null;

  const interior = useNodeInterior(focusedBodyId);
  const lodOpacity = resolveLodOpacity(reveal);

  // 다리의 끝 — 충분히 확대하면 실제로 그 천체를 연다. 배율은 1로 돌려 새 층이 화면을 채운다.
  //
  // 렌더 중이 아니라 effect에서 부르는 이유: onSelect가 부모 상태를 갈아치우므로 렌더 도중
  // 호출하면 React가 렌더 중 업데이트로 경고하고, 최악엔 같은 프레임에서 두 번 들어간다.
  const descendedRef = useRef<string | null>(null);
  const ascendedRef = useRef(false);
  // 진입은 초점보다 훨씬 좁은 반경 — 사실상 그 천체를 가리키고 있을 때만 열린다.
  const canCommit = focused !== null && isWithinCommitRadius(focused.distance, Math.min(width, height));
  useEffect(() => {
    if (
      !focusedBodyId
      || viewport.zoom < LOD_COMMIT_ZOOM
      || !canCommit
      || descendedRef.current === focusedBodyId
    ) {
      return;
    }

    const body = ordered.find((candidate) => candidate.id === focusedBodyId);

    if (!body) {
      return;
    }

    descendedRef.current = focusedBodyId;
    reset();
    onZoomEnter(body);
  }, [canCommit, focusedBodyId, onZoomEnter, ordered, reset, viewport.zoom]);

  // 층이 바뀌면(=목록이 갈리면) 재진입 걸쇠를 푼다 — 뒤로 나왔다가 같은 천체로 다시 들어갈 수 있게.
  useEffect(() => {
    descendedRef.current = null;
    ascendedRef.current = false;
  }, [ordered]);

  // 반대 방향 — 축소하면 한 층 위로. 들어온 길을 그대로 되짚는다.
  useEffect(() => {
    if (!onAscend || ascendedRef.current || viewport.zoom > LOD_ASCEND_ZOOM) {
      return;
    }

    ascendedRef.current = true;
    onAscend();
  }, [onAscend, viewport.zoom]);
  // 초점 은하만 옅어진다 — 나머지는 그대로 남아 어디서 확대 중인지 맥락이 유지된다.
  const fadedSkyOrbs = useMemo<SkyOrb[]>(
    () => skyOrbs.map((orb) => (orb.id === focusedBodyId ? { ...orb, opacity: lodOpacity.disk } : orb)),
    [focusedBodyId, lodOpacity.disk, skyOrbs],
  );

  // 겹치는 이름은 접는다 — 서울(25개 구)처럼 빽빽한 층에서 이름밭이 되지 않게. 크기 큰
  // 순(ordered)으로 자리를 잡으므로 잘 달린 동네의 이름이 먼저 살아남고, 확대하면 사이가
  // 벌어져 접혔던 이름이 돌아온다.
  const visibleLabelIds = useMemo(() => pickVisibleLabels(
    ordered.flatMap((body, index) => {
      const slot = slots[index];

      if (!slot) {
        return [];
      }

      const radius = ringRadius(slot.ring, ringCount, maxRadius);
      const diameter = BASE_DIAMETER * body.scale;
      const projected = project(width / 2 + slot.unitX * radius, height / 2 + slot.unitY * radius);

      return [{
        id: body.id,
        centerX: projected.x,
        // 이름은 천체 아래에 온다(위 렌더의 빈 자리 높이 = 지름 × 2.7).
        top: projected.y - diameter * 1.35 * viewport.zoom + diameter * 2.7 * viewport.zoom,
        width: labelWidthFor(body.name),
        height: LABEL_TEXT_HEIGHT,
      }];
    }),
    width,
    height,
  ), [height, maxRadius, ordered, project, ringCount, slots, viewport.zoom, width]);

  // 풀린 천체의 '안' — 리프면 회원 행성, 그 위면 하위 지역. 초점 천체의 자리를 중심으로
  // 궤도에 앉힌다(기저 좌표계 — 뷰포트 변환은 3D 레이어가 통째로 건다).
  const interiorOrbs = useMemo<SkyOrb[]>(() => {
    if (!focusedBodyId || reveal <= 0) {
      return [];
    }

    const focusedIndex = ordered.findIndex((body) => body.id === focusedBodyId);
    const slot = slots[focusedIndex];

    if (!slot) {
      return [];
    }

    const focusRadius = ringRadius(slot.ring, ringCount, maxRadius);
    const baseX = width / 2 + slot.unitX * focusRadius;
    const baseY = height / 2 + slot.unitY * focusRadius;
    const planets = interior.galaxy?.planets ?? [];
    // 리프 은하면 행성, 아니면 하위 지역 천체 — 같은 배치 규칙으로 그린다.
    const children: {
      key: string;
      diameter: number;
      brightness: number;
      palette: SkyOrb['palette'];
      highlighted: boolean;
    }[] = planets.length > 0
      ? planets.map((planet) => ({
        key: `planet-${planet.userId}`,
        diameter: Math.max(6, BASE_DIAMETER * 0.55 * planet.scale),
        brightness: planet.brightness,
        palette: planet.isStar ? 'star' : planet.isProtostar ? 'protostar' : 'planet',
        highlighted: planet.isMine,
      }))
      : interior.bodies.map((body) => ({
        key: `child-${body.id}`,
        diameter: BASE_DIAMETER * 0.6 * body.scale,
        brightness: body.brightness,
        palette: body.level === 'group' ? 'group' : 'galaxy',
        highlighted: body.isMine,
      }));

    if (children.length === 0) {
      return [];
    }

    const childSlots = buildOrbitSlots(children.length);
    const childRings = countRings(childSlots);
    // 풀릴수록 궤도가 벌어진다 — 천체 하나가 화면을 차지하며 열리는 느낌.
    //
    // 배율로 나누는 이유: 기저 좌표에 고정하면 화면에 그려질 때 배율만큼 곱해져, 깊이
    // 확대할수록 자식들이 화면 밖으로 날아가 정작 파고드는 자리가 텅 비었다. 화면에서 본
    // 크기를 정해 놓고 기저로 되돌린다.
    const orbitRadius = (Math.min(width, height) * (0.05 + 0.22 * reveal)) / viewport.zoom;

    return children.flatMap((child, index) => {
      const childSlot = childSlots[index];

      if (!childSlot) {
        return [];
      }

      const ringDistance = ringRadius(childSlot.ring, childRings, orbitRadius);

      return [{
        id: child.key,
        x: baseX + childSlot.unitX * ringDistance,
        y: baseY + childSlot.unitY * ringDistance,
        diameter: child.diameter,
        brightness: child.brightness,
        palette: child.palette,
        highlighted: child.highlighted,
        opacity: lodOpacity.planets,
      }];
    });
  }, [focusedBodyId, height, interior, lodOpacity.planets, maxRadius, ordered, reveal, ringCount, slots, viewport.zoom, width]);

  return (
    <View
      style={[styles.canvas, { width, height }]}
      ref={containerRef as never}
      onLayout={onContainerLayout}
      {...panHandlers}
    >
      <UniverseCanvas
        orbs={[...fadedSkyOrbs, ...interiorOrbs]}
        width={width}
        height={height}
        zoom={viewport.zoom}
        panX={viewport.panX}
        panY={viewport.panY}
      />

      {ordered.map((body, index) => {
        const slot = slots[index];

        if (!slot) {
          return null;
        }

        const radius = ringRadius(slot.ring, ringCount, maxRadius);
        const diameter = BASE_DIAMETER * body.scale;
        const projected = project(width / 2 + slot.unitX * radius, height / 2 + slot.unitY * radius);
        const showLabel = visibleLabelIds.has(body.id);
        // 누르는 자리도 배율을 따라간다 — 폭이 고정이면 확대할수록 천체보다 훨씬 좁은 곳만
        // 눌리고, 축소할수록 이웃의 몫까지 먹는다.
        const slotWidth = Math.max(44, LABEL_SLOT_WIDTH * viewport.zoom);

        return (
          <Pressable
            key={body.id}
            onPress={() => onSelect(body)}
            hitSlop={10}
            style={[
              styles.slot,
              {
                width: slotWidth,
                left: projected.x - slotWidth / 2,
                top: projected.y - diameter * 1.35 * viewport.zoom,
              },
            ]}
          >
            {/* 천체 자체는 3D 레이어가 그린다. 여기서는 같은 크기의 빈 자리만 잡아
                레이블이 예전과 같은 위치에 오도록 한다(후광 지름 = 지름 × 2.7). */}
            <View
              style={{ width: diameter * 2.7 * viewport.zoom, height: diameter * 2.7 * viewport.zoom }}
              pointerEvents="none"
            />
            {showLabel ? (
              <>
                <Text style={styles.name} numberOfLines={1}>
                  {body.name}
                </Text>
                <Text style={styles.metric} numberOfLines={1}>
                  {body.averageDistanceKm}km
                  {body.stars > 0 ? ` ★${body.stars}` : ''}
                </Text>
              </>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    position: 'relative',
    overflow: 'hidden',
  },
  slot: {
    position: 'absolute',
    alignItems: 'center',
  },
  name: {
    marginTop: 2,
    color: 'rgba(238, 244, 255, 0.94)',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  metric: {
    color: 'rgba(170, 190, 225, 0.78)',
    fontSize: 10,
    textAlign: 'center',
  },
});

export const ConstellationView = memo(ConstellationViewComponent);
