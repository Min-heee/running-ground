import { memo, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { UniverseCanvas } from '@/features/universe/three/UniverseCanvas';
import type { SkyOrb } from '@/features/universe/three/UniverseSky';
import { useUniverseViewport } from '@/features/universe/hooks/useUniverseViewport';
import { LOD_ASCEND_ZOOM } from '@/features/universe/utils/universeLod';
import {
  buildOrbitSlots,
  countRings,
  ringRadius,
} from '@/features/universe/utils/universeLayout';
import type { UniverseGalaxy, UniversePlanet } from '@/lib/api/types';

// 은하 내부 — 중심에 항성(봉인된 지난달 1등), 둘레에 행성들.
//
// 천체는 3D 레이어(UniverseCanvas)가 그리고, 이름과 터치 영역만 RN View로 위에 남긴다 —
// 바깥 층(ConstellationView)과 완전히 같은 구조다. 우주 전체가 한 가지 방식으로 그려져야
// 확대해서 내려올 때 재질이 바뀌는 이질감이 없다.
//
// 예전엔 행성이 궤도를 돌았다(Animated + 네이티브 드라이버). 3D로 옮기며 공전을 멈춘 이유:
// 궤도를 three의 렌더 루프로 돌리면 RN 레이블은 Animated 시계로 따라가야 하는데, 두 시계는
// 시작 시점이 달라 이름이 제 행성을 벗어난다. 대신 구체가 자전하고 배경 성운·별밭이 표류해
// 화면은 여전히 살아 있다. (JS 스레드 setState 루프는 여기서도 단 하나도 돌지 않는다.)

const PLANET_BASE_DIAMETER = 20;
const STAR_DIAMETER = 40;
const PLANET_SLOT_WIDTH = 84;

function PlanetLabel({ planet }: { planet: UniversePlanet }) {
  // 이름을 다 띄우면 회원이 늘수록 글자밭이 된다 — 항성·원시성·나만 이름을 달고
  // 나머지는 눌러서 확인한다.
  if (!planet.isMine && !planet.isStar && !planet.isProtostar) {
    return null;
  }

  return (
    <>
      <Text style={styles.planetName} numberOfLines={1}>
        {planet.userName}
      </Text>
      {planet.isProtostar ? <Text style={styles.protostarTag}>이번 달 1등</Text> : null}
    </>
  );
}

function GalaxyViewComponent({
  galaxy,
  width,
  height,
  onSelectPlanet,
  onAscend,
}: {
  galaxy: UniverseGalaxy;
  width: number;
  height: number;
  onSelectPlanet: (planet: UniversePlanet) => void;
  onAscend?: () => void;
}) {
  const { viewport, panHandlers, webWheelRef } = useUniverseViewport({ width, height });

  // 항성은 궤도에 앉지 않는다 — 중심이 항성의 자리다.
  const centerPlanets = useMemo(
    () => galaxy.planets.filter((planet) => planet.isStar),
    [galaxy.planets],
  );
  const orbitPlanets = useMemo(
    () => galaxy.planets.filter((planet) => !planet.isStar),
    [galaxy.planets],
  );

  const slots = useMemo(() => buildOrbitSlots(orbitPlanets.length), [orbitPlanets.length]);
  const ringCount = useMemo(() => countRings(slots), [slots]);
  const maxRadius = Math.max(0, Math.min(width, height) / 2 - 46);

  // 기저 좌표(확대 전) — 3D와 레이블이 같은 값을 쓴다.
  const placed = useMemo(() => orbitPlanets.flatMap((planet, index) => {
    const slot = slots[index];

    if (!slot) {
      return [];
    }

    const radius = ringRadius(slot.ring, ringCount, maxRadius);

    return [{
      planet,
      x: width / 2 + slot.unitX * radius,
      y: height / 2 + slot.unitY * radius,
      diameter: PLANET_BASE_DIAMETER * planet.scale,
    }];
  }), [height, maxRadius, orbitPlanets, ringCount, slots, width]);

  const placedStars = useMemo(() => centerPlanets.map((planet) => ({
    planet,
    x: width / 2,
    y: height / 2,
    diameter: STAR_DIAMETER * Math.max(0.8, planet.scale),
  })), [centerPlanets, height, width]);

  const orbs = useMemo<SkyOrb[]>(() => [
    ...placedStars.map(({ planet, x, y, diameter }) => ({
      id: planet.userId,
      x,
      y,
      diameter,
      brightness: Math.max(0.75, planet.brightness),
      palette: 'star' as const,
      highlighted: planet.isMine,
    })),
    ...placed.map(({ planet, x, y, diameter }) => ({
      id: planet.userId,
      x,
      y,
      diameter,
      brightness: planet.brightness,
      palette: planet.isProtostar ? ('protostar' as const) : ('planet' as const),
      highlighted: planet.isMine,
    })),
  ], [placed, placedStars]);

  // screen = (base - center) * zoom + center + pan — UniverseSky의 group 변환과 같은 식.
  const project = (baseX: number, baseY: number) => ({
    x: (baseX - width / 2) * viewport.zoom + width / 2 + viewport.panX,
    y: (baseY - height / 2) * viewport.zoom + height / 2 + viewport.panY,
  });

  // 축소하면 한 층 위로 — 확대로 들어온 길을 그대로 되짚는다.
  const ascendedRef = useRef(false);
  useEffect(() => {
    if (!onAscend || ascendedRef.current || viewport.zoom > LOD_ASCEND_ZOOM) {
      return;
    }

    ascendedRef.current = true;
    onAscend();
  }, [onAscend, viewport.zoom]);

  return (
    <View
      style={[styles.canvas, { width, height }]}
      ref={webWheelRef as never}
      {...panHandlers}
    >
      <UniverseCanvas
        orbs={orbs}
        width={width}
        height={height}
        zoom={viewport.zoom}
        panX={viewport.panX}
        panY={viewport.panY}
      />

      {placedStars.map(({ planet, x, y, diameter }) => {
        const projected = project(x, y);

        return (
          <Pressable
            key={planet.userId}
            onPress={() => onSelectPlanet(planet)}
            hitSlop={12}
            style={[
              styles.slot,
              {
                width: PLANET_SLOT_WIDTH * 1.5,
                left: projected.x - (PLANET_SLOT_WIDTH * 1.5) / 2,
                top: projected.y - diameter * 0.7 * viewport.zoom,
              },
            ]}
          >
            {/* 천체 자체는 3D 레이어가 그린다 — 여기서는 이름이 앉을 자리만 비워 둔다. */}
            <View
              style={{ width: diameter * viewport.zoom, height: diameter * 1.4 * viewport.zoom }}
              pointerEvents="none"
            />
            <Text style={styles.starName} numberOfLines={1}>
              {planet.userName}
            </Text>
            <Text style={styles.starTag}>
              {galaxy.star ? `${galaxy.star.monthKey.replace('-', '년 ')}월 항성` : '항성'}
            </Text>
          </Pressable>
        );
      })}

      {placedStars.length === 0 ? (
        <View style={[styles.emptyStar, { left: width / 2 - 60, top: height / 2 - 20 }]}>
          <View style={styles.emptyStarCore} />
          <Text style={styles.emptyStarText}>아직 항성 없음</Text>
        </View>
      ) : null}

      {placed.map(({ planet, x, y, diameter }) => {
        const projected = project(x, y);

        return (
          <Pressable
            key={planet.userId}
            onPress={() => onSelectPlanet(planet)}
            hitSlop={12}
            style={[
              styles.slot,
              {
                width: PLANET_SLOT_WIDTH,
                left: projected.x - PLANET_SLOT_WIDTH / 2,
                top: projected.y - diameter * 0.7 * viewport.zoom,
              },
            ]}
          >
            <View
              style={{ width: diameter * viewport.zoom, height: diameter * 1.4 * viewport.zoom }}
              pointerEvents="none"
            />
            <PlanetLabel planet={planet} />
          </Pressable>
        );
      })}

      {galaxy.nebula ? (
        <View style={[styles.nebula, { width: width * 0.62, left: width * 0.19 }]} pointerEvents="none">
          <Text style={styles.nebulaText}>
            성운 · 러너 {galaxy.nebula.memberCount}명
          </Text>
        </View>
      ) : null}
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
  planetName: {
    marginTop: 2,
    color: 'rgba(238, 244, 255, 0.94)',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  protostarTag: {
    color: 'rgba(255, 214, 122, 0.95)',
    fontSize: 9,
    fontWeight: '600',
  },
  starName: {
    marginTop: 4,
    color: 'rgba(255, 244, 220, 0.98)',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  starTag: {
    color: 'rgba(255, 206, 122, 0.9)',
    fontSize: 10,
    fontWeight: '600',
  },
  emptyStar: {
    position: 'absolute',
    width: 120,
    alignItems: 'center',
  },
  emptyStarCore: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(190, 205, 235, 0.4)',
  },
  emptyStarText: {
    marginTop: 6,
    color: 'rgba(170, 190, 225, 0.7)',
    fontSize: 11,
  },
  nebula: {
    position: 'absolute',
    bottom: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(120, 150, 220, 0.13)',
    alignItems: 'center',
  },
  nebulaText: {
    color: 'rgba(196, 212, 240, 0.82)',
    fontSize: 11,
  },
});

export const GalaxyView = memo(GalaxyViewComponent);
