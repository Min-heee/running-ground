import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

// 천체 하나의 발광체. 새 라이브러리(SVG·Skia·GL) 없이 겹친 반투명 원 두 겹으로 후광을
// 만든다 — RN 0.81 New Arch의 boxShadow도 같이 얹지만, 그건 지원되면 좋은 덤이고 후광
// 자체는 어디서든 도는 View 조합으로 낸다. 우주 탭이 OTA로 나갈 수 있는 이유가 이거다.

export type OrbPalette = 'galaxy' | 'planet' | 'star' | 'protostar';

const PALETTES: Record<OrbPalette, { core: string; halo: string }> = {
  galaxy: { core: '255, 236, 205', halo: '138, 168, 255' },
  planet: { core: '176, 224, 255', halo: '96, 150, 240' },
  star: { core: '255, 214, 122', halo: '255, 168, 64' },
  protostar: { core: '255, 238, 184', halo: '255, 200, 104' },
};

const HALO_OUTER_RATIO = 2.7;
const HALO_INNER_RATIO = 1.65;

function CelestialOrbComponent({
  diameter,
  brightness,
  palette,
  highlighted = false,
}: {
  diameter: number;
  // 0~1. 서버가 계산한 값을 그대로 받는다.
  brightness: number;
  palette: OrbPalette;
  // 내 천체 — 얇은 테두리로만 표시한다(색을 바꾸면 밝기 정보가 죽는다).
  highlighted?: boolean;
}) {
  const { core, halo } = PALETTES[palette];
  const outer = diameter * HALO_OUTER_RATIO;
  const inner = diameter * HALO_INNER_RATIO;

  return (
    <View style={[styles.wrap, { width: outer, height: outer }]} pointerEvents="none">
      <View
        style={[
          styles.circle,
          {
            width: outer,
            height: outer,
            borderRadius: outer / 2,
            backgroundColor: `rgba(${halo}, ${(0.09 * brightness).toFixed(3)})`,
          },
        ]}
      />
      <View
        style={[
          styles.circle,
          {
            width: inner,
            height: inner,
            borderRadius: inner / 2,
            backgroundColor: `rgba(${halo}, ${(0.2 * brightness).toFixed(3)})`,
          },
        ]}
      />
      <View
        style={[
          styles.circle,
          {
            width: diameter,
            height: diameter,
            borderRadius: diameter / 2,
            backgroundColor: `rgba(${core}, ${(0.34 + 0.66 * brightness).toFixed(3)})`,
            boxShadow: `0px 0px ${Math.round(diameter * 0.9)}px rgba(${halo}, ${(0.55 * brightness).toFixed(3)})`,
          },
          highlighted && {
            borderWidth: 1.5,
            borderColor: 'rgba(255, 255, 255, 0.92)',
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    position: 'absolute',
  },
});

export const CelestialOrb = memo(CelestialOrbComponent);
