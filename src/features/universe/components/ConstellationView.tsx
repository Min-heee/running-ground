import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CelestialOrb } from '@/features/universe/components/CelestialOrb';
import { StarField } from '@/features/universe/components/StarField';
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

  return (
    <View style={[styles.canvas, { width, height }]}>
      <StarField width={width} height={height} />

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
            <CelestialOrb
              diameter={diameter}
              brightness={body.brightness}
              palette="galaxy"
              highlighted={body.isMine}
            />
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
