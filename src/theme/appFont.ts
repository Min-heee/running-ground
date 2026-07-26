import { loadAsync } from 'expo-font';
import { StyleSheet, Text, TextInput, type TextStyle } from 'react-native';

// 전역 앱 폰트: Freesentation (오너 픽 2026-07-26).
//
// RN 0.81의 Text는 옛날식 Text.render 패치가 불가능한 구조라, jsx 런타임의
// 엘리먼트 생성 지점에서 Text/TextInput의 style에 fontFamily를 주입한다 —
// 화면별 수정 없이 모든 텍스트(서드파티 포함)에 적용되고, 폰트 로드에 실패하면
// 패치 자체가 켜지지 않아 시스템 폰트로 그대로 동작한다 (fail-open).
//
// 가중치 매핑: 스타일의 fontWeight로 정확한 웨이트 파일을 고르고, 주입 시
// fontWeight를 normal로 눌러 Android가 합성 볼드를 이중으로 얹는 것을 막는다.
// 명시적으로 fontFamily를 지정한 텍스트는 건드리지 않는다.

const FONT_SOURCES = {
  'Freesentation-Regular': require('../../assets/fonts/Freesentation-4Regular.ttf'),
  'Freesentation-SemiBold': require('../../assets/fonts/Freesentation-6SemiBold.ttf'),
  'Freesentation-Bold': require('../../assets/fonts/Freesentation-7Bold.ttf'),
  'Freesentation-ExtraBold': require('../../assets/fonts/Freesentation-8ExtraBold.ttf'),
  'Freesentation-Black': require('../../assets/fonts/Freesentation-9Black.ttf'),
};

const REGULAR_FAMILY = 'Freesentation-Regular';

const FAMILY_BY_WEIGHT: Record<string, string> = {
  '100': REGULAR_FAMILY,
  '200': REGULAR_FAMILY,
  '300': REGULAR_FAMILY,
  '400': REGULAR_FAMILY,
  normal: REGULAR_FAMILY,
  '500': 'Freesentation-SemiBold',
  '600': 'Freesentation-SemiBold',
  '700': 'Freesentation-Bold',
  bold: 'Freesentation-Bold',
  '800': 'Freesentation-ExtraBold',
  '900': 'Freesentation-Black',
};

let fontsReady = false;

function resolveInjectedFontStyle(style: unknown): TextStyle | null {
  const flat = (StyleSheet.flatten(style as TextStyle) ?? {}) as TextStyle;

  if (flat.fontFamily) {
    return null;
  }

  const family = FAMILY_BY_WEIGHT[String(flat.fontWeight ?? '400')] ?? REGULAR_FAMILY;
  return { fontFamily: family, fontWeight: 'normal' };
}

function withAppFont(props: Record<string, unknown> | null) {
  try {
    if (!fontsReady || !props) {
      return props;
    }

    const injected = resolveInjectedFontStyle(props.style);

    if (!injected) {
      return props;
    }

    // 주입 스타일을 뒤에 붙여 fontWeight:normal이 이기게 한다 (합성 볼드 방지).
    return { ...props, style: [props.style, injected] };
  } catch {
    // 어떤 예외도 렌더를 깨면 안 된다 — 원본 그대로.
    return props;
  }
}

type JsxFunction = (type: unknown, props: Record<string, unknown> | null, ...rest: unknown[]) => unknown;

function patchRuntimeExports(runtime: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const original = runtime[key] as JsxFunction | undefined;

    if (typeof original !== 'function') {
      continue;
    }

    runtime[key] = (type: unknown, props: Record<string, unknown> | null, ...rest: unknown[]) => {
      if (type === Text || type === TextInput) {
        return original(type, withAppFont(props), ...rest);
      }

      return original(type, props, ...rest);
    };
  }
}

function applyGlobalFontPatch() {
  // Metro는 CJS로 컴파일하므로 런타임 exports 객체는 가변이고, 호출부는 매번
  // 프로퍼티 조회를 하므로 이미 import된 모듈에도 즉시 반영된다.
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    patchRuntimeExports(require('react/jsx-runtime'), ['jsx', 'jsxs']);
    patchRuntimeExports(require('react/jsx-dev-runtime'), ['jsxDEV']);
    patchRuntimeExports(require('react'), ['createElement']);
    /* eslint-enable @typescript-eslint/no-require-imports */
  } catch (error) {
    console.warn(`[appFont] 전역 폰트 패치 실패 — 시스템 폰트로 동작: ${String(error)}`);
  }
}

// 부트 게이트에서 호출 — 로드 성공 시에만 패치가 켜진다. 실패해도 throw하지
// 않아 부팅을 절대 막지 않는다.
export async function loadAppFonts(): Promise<void> {
  try {
    await loadAsync(FONT_SOURCES);
    fontsReady = true;
    applyGlobalFontPatch();
  } catch (error) {
    console.warn(`[appFont] 폰트 로드 실패 — 시스템 폰트로 동작: ${String(error)}`);
  }
}
