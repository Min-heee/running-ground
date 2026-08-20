import { memo, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, ShaderMaterial } from 'three';

// '내 것'의 표식 — 시계 베젤 위를 도는 빛처럼, 밝은 점 하나가 1px 원둘레를 천천히 돈다.
//
// 납작한 ringGeometry를 버린 이유: 두께가 반지름에 비례해 크게 보면 회색 도넛이 됐고,
// 정지한 균일 링은 우주 위에 '그려 놓은 도형'으로 읽혔다(코드 주석이 두 번 싸우던 문제).
// 문턱 대비에서는 움직임이 정지 대비를 이긴다 — 더 옅은데 더 눈에 띈다.
// 일반 합성이라 광원이 아니라 표식이고, 바꾸기 전의 링보다 화면을 덜 밝힌다.
const RING_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const RING_FRAGMENT = `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float ring = 1.0 - smoothstep(0.0, 0.014, abs(r - 0.94));
  float ang = atan(p.y, p.x);
  float sweep = 0.3 + 0.7 * pow(0.5 + 0.5 * sin(ang + uTime * 0.35), 1.8);
  float breath = 0.82 + 0.18 * sin(uTime * 0.8);
  gl_FragColor = vec4(uColor, ring * sweep * breath * uOpacity * 0.5);
}
`;

function HighlightRingComponent({
  color,
  opacity,
  scale,
}: {
  color: string;
  opacity: number;
  // 링의 지름은 판의 0.94배 — 판 크기(월드 단위)는 호출자가 정한다.
  scale: number;
}) {
  const material = useMemo(() => new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(color) },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: RING_VERTEX,
    fragmentShader: RING_FRAGMENT,
    transparent: true,
    depthWrite: false,
  }), [color]);

  useEffect(() => () => material.dispose(), [material]);

  material.uniforms.uOpacity.value = opacity;

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <mesh material={material} scale={[scale, scale, 1]}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}

export const HighlightRing = memo(HighlightRingComponent);
