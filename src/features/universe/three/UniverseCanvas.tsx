import { memo, useEffect } from 'react';
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
  // 콜드 로드 킥 — 첫 로드에서 캔버스가 검은 채 시작하는 일이 있다(리사이즈 이벤트
  // 하나면 즉시 살아난다: r3f의 크기 관찰이 첫 레이아웃을 놓치는 레이스). 마운트 직후는
  // 너무 일러서 안 먹히는 것을 실측했다 — 첫 몇 초에 걸쳐 몇 번 쏜다. 페이지당 레이아웃
  // 네 번이 전부고, 정상일 때는 아무 일도 안 일어난다. 이 파일은 웹 전용이라 window가
  // 항상 있다.
  useEffect(() => {
    const kick = () => window.dispatchEvent(new Event('resize'));
    const timers = [250, 1000, 2500, 5000, 9000, 14000].map((delay) => setTimeout(kick, delay));

    // 숨은 탭에서 로드되면(rAF가 잠든 채 초기화) 다시 보이는 순간에도 한 번.
    document.addEventListener('visibilitychange', kick);

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      document.removeEventListener('visibilitychange', kick);
    };
  }, []);

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
        // MSAA는 끈다 — 모든 프레임이 EffectComposer의 오프스크린 타깃을 거쳐 전체 화면
        // 사각형으로 나오므로 기본 프레임버퍼의 멀티샘플은 순수한 낭비다. 컴포저가 없는
        // 네이티브 진입점(.native.tsx)은 계속 켠다.
        gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}
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
