import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas } from '@react-three/fiber';

import { UniverseSky, type SkyOrb } from '@/features/universe/three/UniverseSky';
import { UniverseBloom } from '@/features/universe/three/UniverseBloom';

// 웹 진입점. 네이티브는 UniverseCanvas.native.tsx가 '@react-three/fiber/native'(expo-gl)를
// 쓴다 — 번들러가 플랫폼 확장자로 갈라준다. 두 파일의 차이는 Canvas import 한 줄뿐이다.
//
// 직교 카메라 + zoom 1: 월드 1 = 픽셀 1이라 기존 화면 좌표를 그대로 넘길 수 있다.
function UniverseCanvasComponent({
  orbs,
  width,
  height,
  zoom = 1,
  panX = 0,
  panY = 0,
  zoomFactor = 1,
}: {
  orbs: SkyOrb[];
  width: number;
  height: number;
  zoom?: number;
  panX?: number;
  panY?: number;
  zoomFactor?: number;
}) {
  if (width <= 0 || height <= 0) {
    return null;
  }

  return (
    <View style={[StyleSheet.absoluteFill, { width, height }]} pointerEvents="none">
      <Canvas
        orthographic
        // 깊이 범위를 크게 잡는다: 장면 전체가 배율(최대 수백 배)로 확대되면서 천체의
        // z 폭도 같이 커져, 좁게 잡으면 확대할수록 뒤에 남아야 할 은하가 통째로 잘려 나간다.
        // 직교 투영이라 범위를 넓혀도 깊이 정밀도가 나빠지지 않는다.
        camera={{ position: [0, 0, 600], zoom: 1, near: -200000, far: 200000 }}
        // 기기 픽셀 밀도를 따라간다. 지정하지 않으면 r3f가 1로 고정해서, 레티나 화면에서
        // 절반 해상도로 그린 뒤 늘리는 셈이 된다 — 행성 표면도 이름표 옆 별점도 뭉갠다.
        // 상한을 2로 두는 건 3배 화면에서 픽셀 수가 9배가 되는 걸 막기 위해서다.
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        style={{ width, height }}
      >
        <UniverseSky
          orbs={orbs}
          width={width}
          height={height}
          zoom={zoom}
          panX={panX}
          panY={panY}
          zoomFactor={zoomFactor}
        />
        {/* 밝은 것 주위로 빛이 번진다 — 웹에서만. 네이티브 진입점(.native.tsx)에는 없다. */}
        <UniverseBloom />
      </Canvas>
    </View>
  );
}

export const UniverseCanvas = memo(UniverseCanvasComponent);
