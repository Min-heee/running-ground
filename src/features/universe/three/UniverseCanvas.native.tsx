import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas } from '@react-three/fiber/native';

import { UniverseSky, type SkyOrb } from '@/features/universe/three/UniverseSky';

// 네이티브 진입점 (expo-gl). 웹은 UniverseCanvas.tsx.
// 쓴다 — 번들러가 플랫폼 확장자로 갈라준다. 두 파일의 차이는 Canvas import 한 줄뿐이다.
//
// 직교 카메라 + zoom 1: 월드 1 = 픽셀 1이라 기존 화면 좌표를 그대로 넘길 수 있다.
function UniverseCanvasComponent({
  orbs,
  width,
  height,
}: {
  orbs: SkyOrb[];
  width: number;
  height: number;
}) {
  if (width <= 0 || height <= 0) {
    return null;
  }

  return (
    <View style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      <Canvas
        orthographic
        camera={{ position: [0, 0, 600], zoom: 1, near: 0.1, far: 2000 }}
        gl={{ antialias: true, alpha: true }}
        style={{ width, height }}
      >
        <UniverseSky orbs={orbs} width={width} height={height} />
      </Canvas>
    </View>
  );
}

export const UniverseCanvas = memo(UniverseCanvasComponent);
