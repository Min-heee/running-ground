import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { UniverseCanvas } from '@/features/universe/three/UniverseCanvas';
import type { SkyOrb } from '@/features/universe/three/UniverseSky';
import {
  buildOrbitSlots,
  countRings,
  ringRadius,
} from '@/features/universe/utils/universeLayout';
import type { UniverseBody } from '@/lib/api/types';

// 은하단·은하군 화면 — 자식 천체를 동심 궤도에 앉힌다. 여기서는 궤도를 돌리지 않는다:
// 이 층은 이름을 읽고 눌러 들어가는 화면이라 가만히 있는 편이 읽기 쉽다. 도는 건 은하
// 내부(행성)에서만 한다.

const BASE_DIAMETER = 26;
const LABEL_SLOT_WIDTH = 96;

function ConstellationViewComponent({
  bodies,
  width,
  height,
  onSelect,
}: {
  bodies: UniverseBody[];
  width: number;
  height: number;
  onSelect: (body: UniverseBody) => void;
}) {
  // 크기 큰 순으로 안쪽 궤도부터 — 중심에 가까울수록 잘 달린 동네다.
  const ordered = useMemo(
    () => [...bodies].sort((left, right) => right.scale - left.scale),
    [bodies],
  );
  const slots = useMemo(() => buildOrbitSlots(ordered.length), [ordered.length]);
  const ringCount = useMemo(() => countRings(slots), [slots]);
  const maxRadius = Math.max(0, Math.min(width, height) / 2 - 54);

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

  return (
    <View style={[styles.canvas, { width, height }]}>
      <UniverseCanvas orbs={skyOrbs} width={width} height={height} />

      {ordered.map((body, index) => {
        const slot = slots[index];

        if (!slot) {
          return null;
        }

        const radius = ringRadius(slot.ring, ringCount, maxRadius);
        const diameter = BASE_DIAMETER * body.scale;

        return (
          <Pressable
            key={body.id}
            onPress={() => onSelect(body)}
            hitSlop={10}
            style={[
              styles.slot,
              {
                width: LABEL_SLOT_WIDTH,
                left: width / 2 + slot.unitX * radius - LABEL_SLOT_WIDTH / 2,
                top: height / 2 + slot.unitY * radius - diameter * 1.35,
              },
            ]}
          >
            {/* 천체 자체는 3D 레이어가 그린다. 여기서는 같은 크기의 빈 자리만 잡아
                레이블이 예전과 같은 위치에 오도록 한다(후광 지름 = 지름 × 2.7). */}
            <View style={{ width: diameter * 2.7, height: diameter * 2.7 }} pointerEvents="none" />
            <Text style={styles.name} numberOfLines={1}>
              {body.name}
            </Text>
            <Text style={styles.metric} numberOfLines={1}>
              {body.averageDistanceKm}km
              {body.stars > 0 ? ` ★${body.stars}` : ''}
            </Text>
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
