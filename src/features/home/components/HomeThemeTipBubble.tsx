import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';

// One-time coach marks under the home header (오너 2026-08-13: 테마에 이어 물음표도).
// 순차 2연발: 첫 설치에서 테마 토글 말풍선 → 닫으면 사용법(?) 말풍선. 각자 자기 seen-key를
// 가져서, 테마 팁을 이미 본 기존 유저도 사용법 팁은 한 번 받는다. Storage는 themeMode.ts와
// 같은 웹 localStorage / 네이티브 SecureStore, 모든 경로가 실패를 삼킨다. Fail-closed 방향은
// 잔소리 금지: 저장소 READ 실패 = 이미 본 것 — 고장난 저장소가 매 실행 팁을 재노출하면 안 된다.
const THEME_TIP_SEEN_STORAGE_KEY = 'runningground.homeThemeTipSeen.v1';
const TOUR_TIP_SEEN_STORAGE_KEY = 'runningground.homeTourTipSeen.v1';

function getWebStorage() {
  if (typeof window !== 'undefined' && 'localStorage' in window && window.localStorage) {
    return window.localStorage;
  }

  return null;
}

async function hasSeenTip(storageKey: string): Promise<boolean> {
  const webStorage = getWebStorage();

  if (webStorage) {
    try {
      return webStorage.getItem(storageKey) === 'true';
    } catch {
      return true;
    }
  }

  try {
    if (!(await SecureStore.isAvailableAsync())) {
      return true;
    }

    return (await SecureStore.getItemAsync(storageKey)) === 'true';
  } catch {
    return true;
  }
}

async function markTipSeen(storageKey: string): Promise<void> {
  const webStorage = getWebStorage();

  if (webStorage) {
    try {
      webStorage.setItem(storageKey, 'true');
    } catch {
      // Persistence failure only risks the tip showing once more on a later launch.
    }
    return;
  }

  try {
    if (await SecureStore.isAvailableAsync()) {
      await SecureStore.setItemAsync(storageKey, 'true');
    }
  } catch {
    // Same as above — never let a storage hiccup crash the home screen.
  }
}

// Header geometry (HomeHeader/TabHeader): four 40px icon buttons, 4px gaps —
// [사용법 ?] [테마] [공지] [알림]. 오른쪽 끝에서 n번째 버튼의 중심 = icon*(n-1) + gap*(n-1)
// + icon/2. Derived from tokens so a header restyle keeps the arrows honest.
const ICON_BUTTON_SIZE = spacing.s20 * 2;
const ICON_BUTTON_GAP = spacing.sm;
const ARROW_HALF_WIDTH = 7;

function arrowCenterFromRight(buttonIndexFromRight: number) {
  return (ICON_BUTTON_SIZE + ICON_BUTTON_GAP) * (buttonIndexFromRight - 1) + ICON_BUTTON_SIZE / 2;
}

const THEME_ARROW_CENTER = arrowCenterFromRight(3);
const TOUR_ARROW_CENTER = arrowCenterFromRight(4);

type ActiveTip = 'theme' | 'tour' | null;

export function HomeThemeTipBubble() {
  const [activeTip, setActiveTip] = useState<ActiveTip>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!(await hasSeenTip(THEME_TIP_SEEN_STORAGE_KEY))) {
        if (cancelled) {
          return;
        }

        setActiveTip('theme');
        // Mark seen the moment it renders: the toggle itself reloads the whole JS
        // bundle, so waiting for an explicit dismiss would re-show it after every
        // theme switch on this first session.
        void markTipSeen(THEME_TIP_SEEN_STORAGE_KEY);
        return;
      }

      if (!(await hasSeenTip(TOUR_TIP_SEEN_STORAGE_KEY))) {
        if (cancelled) {
          return;
        }

        setActiveTip('tour');
        void markTipSeen(TOUR_TIP_SEEN_STORAGE_KEY);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!activeTip) {
    return null;
  }

  const isTheme = activeTip === 'theme';
  const handleClose = () => {
    if (isTheme) {
      // 테마 팁을 닫으면 곧바로 사용법 팁 차례 — 같은 첫 세션에서 이어 보여준다.
      void markTipSeen(TOUR_TIP_SEEN_STORAGE_KEY);
      setActiveTip('tour');
      return;
    }

    setActiveTip(null);
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View
        style={[
          styles.arrow,
          { marginRight: (isTheme ? THEME_ARROW_CENTER : TOUR_ARROW_CENTER) - ARROW_HALF_WIDTH },
        ]}
      />
      <Pressable
        accessibilityLabel={isTheme ? '테마 안내 닫기' : '사용법 안내 닫기'}
        accessibilityRole="button"
        onPress={handleClose}
        style={styles.bubble}
      >
        <Text style={styles.text}>
          {isTheme
            ? '여기서 다크 모드와 라이트 모드를 바꿀 수 있어요!'
            : '처음이라면 여기! 앱 사용 방법을 하나씩 안내해 드려요.'}
        </Text>
        <Text style={styles.subText}>눌러서 닫기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'flex-end',
    alignSelf: 'stretch',
    // Pull the balloon up toward the header so the arrow visually touches the button
    // row (contentWrap already inserts a 16px gap).
    marginTop: -spacing.s10,
  },
  arrow: {
    borderBottomColor: colors.brand,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderLeftWidth: ARROW_HALF_WIDTH,
    borderRightColor: 'transparent',
    borderRightWidth: ARROW_HALF_WIDTH,
    height: 0,
    width: 0,
  },
  bubble: {
    backgroundColor: colors.brand,
    borderRadius: radii.md,
    maxWidth: 280,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s12,
  },
  text: {
    color: colors.white,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    lineHeight: 20,
  },
  subText: {
    color: colors.white,
    fontSize: fontSizes.xxs,
    marginTop: spacing.sm,
    opacity: 0.8,
  },
});
