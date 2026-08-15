import { memo, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { CelestialOrb } from '@/features/universe/components/CelestialOrb';
import { StarField } from '@/features/universe/components/StarField';
import {
  buildOrbitSlots,
  countRings,
  ringRadius,
} from '@/features/universe/utils/universeLayout';
import type { UniverseGalaxy, UniversePlanet } from '@/lib/api/types';

// 은하 내부 — 중심에 항성(봉인된 지난달 1등), 둘레에 행성들이 돈다.
//
// 회전은 전부 Animated + useNativeDriver의 transform이다. setState 루프는 단 하나도 돌지
// 않는다 — 예전에 1Hz setNowMs가 전체 트리를 리렌더시켜 매치 화면이 버벅인 전례가 있어서,
// 우주는 JS 스레드를 아예 건드리지 않는 방식만 쓴다.
//
// 공전 주기가 아주 느린 건(1바퀴 96~216초) 의도다: 살아 있어 보이되 행성을 누르기 쉬워야 한다.

const MAX_RINGS = 5;
const RING_PERIOD_MS = [96000, 126000, 156000, 186000, 216000];
const PLANET_BASE_DIAMETER = 20;
const STAR_DIAMETER = 40;
const PLANET_SLOT_WIDTH = 84;

function usePlanetOrbitSpins() {
  const spins = useRef(
    Array.from({ length: MAX_RINGS }, () => new Animated.Value(0)),
  ).current;

  useEffect(() => {
    const loops = spins.map((spin, index) => {
      spin.setValue(0);

      return Animated.loop(
        Animated.timing(spin, {
          toValue: 1,
          duration: RING_PERIOD_MS[index],
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
    });

    for (const loop of loops) {
      loop.start();
    }

    return () => {
      for (const loop of loops) {
        loop.stop();
      }
    };
  }, [spins]);

  return spins;
}

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

function ProtostarPulse({ children }: { children: React.ReactNode }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();

    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={{
        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
      }}
    >
      {children}
    </Animated.View>
  );
}

function GalaxyViewComponent({
  galaxy,
  width,
  height,
  onSelectPlanet,
}: {
  galaxy: UniverseGalaxy;
  width: number;
  height: number;
  onSelectPlanet: (planet: UniversePlanet) => void;
}) {
  const spins = usePlanetOrbitSpins();

  // 항성은 궤도를 돌지 않는다 — 중심이 항성의 자리다.
  const centerPlanets = useMemo(
    () => galaxy.planets.filter((planet) => planet.isStar),
    [galaxy.planets],
  );
  const orbitPlanets = useMemo(
    () => galaxy.planets.filter((planet) => !planet.isStar),
    [galaxy.planets],
  );

  const slots = useMemo(() => buildOrbitSlots(orbitPlanets.length), [orbitPlanets.length]);
  const ringCount = useMemo(() => Math.min(MAX_RINGS, countRings(slots)), [slots]);
  const maxRadius = Math.max(0, Math.min(width, height) / 2 - 46);

  const planetsByRing = useMemo(() => {
    const grouped: { planet: UniversePlanet; unitX: number; unitY: number }[][] = Array.from(
      { length: MAX_RINGS },
      () => [],
    );

    orbitPlanets.forEach((planet, index) => {
      const slot = slots[index];

      if (!slot) {
        return;
      }

      grouped[Math.min(slot.ring, MAX_RINGS - 1)].push({
        planet,
        unitX: slot.unitX,
        unitY: slot.unitY,
      });
    });

    return grouped;
  }, [orbitPlanets, slots]);

  return (
    <View style={[styles.canvas, { width, height }]}>
      <StarField width={width} height={height} />

      {planetsByRing.map((ringPlanets, ring) => {
        if (ringPlanets.length === 0) {
          return null;
        }

        const radius = ringRadius(ring, ringCount, maxRadius);
        const spin = spins[ring];
        const forward = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
        const backward = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });

        return (
          <Animated.View
            key={ring}
            style={[
              styles.ring,
              {
                width: radius * 2,
                height: radius * 2,
                left: width / 2 - radius,
                top: height / 2 - radius,
                transform: [{ rotate: forward }],
              },
            ]}
          >
            {ringPlanets.map(({ planet, unitX, unitY }) => {
              const diameter = PLANET_BASE_DIAMETER * planet.scale;

              return (
                <Animated.View
                  key={planet.userId}
                  style={[
                    styles.planetSlot,
                    {
                      width: PLANET_SLOT_WIDTH,
                      left: radius + unitX * radius - PLANET_SLOT_WIDTH / 2,
                      top: radius + unitY * radius - diameter * 1.35,
                      // 궤도가 도는 만큼 되돌려서 이름이 뒤집히지 않게 한다.
                      transform: [{ rotate: backward }],
                    },
                  ]}
                >
                  <Pressable onPress={() => onSelectPlanet(planet)} hitSlop={12} style={styles.planetPress}>
                    {planet.isProtostar ? (
                      <ProtostarPulse>
                        <CelestialOrb
                          diameter={diameter}
                          brightness={planet.brightness}
                          palette="protostar"
                          highlighted={planet.isMine}
                        />
                      </ProtostarPulse>
                    ) : (
                      <CelestialOrb
                        diameter={diameter}
                        brightness={planet.brightness}
                        palette="planet"
                        highlighted={planet.isMine}
                      />
                    )}
                    <PlanetLabel planet={planet} />
                  </Pressable>
                </Animated.View>
              );
            })}
          </Animated.View>
        );
      })}

      <View style={[styles.center, { left: width / 2 - 60, top: height / 2 - 52 }]}>
        {centerPlanets.length > 0 ? (
          centerPlanets.map((planet) => (
            <Pressable key={planet.userId} onPress={() => onSelectPlanet(planet)} hitSlop={12} style={styles.starPress}>
              <CelestialOrb
                diameter={STAR_DIAMETER * Math.max(0.8, planet.scale)}
                brightness={Math.max(0.75, planet.brightness)}
                palette="star"
                highlighted={planet.isMine}
              />
              <Text style={styles.starName} numberOfLines={1}>
                {planet.userName}
              </Text>
              <Text style={styles.starTag}>
                {galaxy.star ? `${galaxy.star.monthKey.replace('-', '년 ')}월 항성` : '항성'}
              </Text>
            </Pressable>
          ))
        ) : (
          <View style={styles.emptyStar}>
            <View style={styles.emptyStarCore} />
            <Text style={styles.emptyStarText}>아직 항성 없음</Text>
          </View>
        )}
      </View>

      {galaxy.nebula ? (
        <View style={[styles.nebula, { width: width * 0.62, left: width * 0.19 }]}>
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
  ring: {
    position: 'absolute',
  },
  planetSlot: {
    position: 'absolute',
    alignItems: 'center',
  },
  planetPress: {
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
  center: {
    position: 'absolute',
    width: 120,
    alignItems: 'center',
  },
  starPress: {
    alignItems: 'center',
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
