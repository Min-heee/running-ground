import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';

// One-time coach mark under the home header pointing at the theme toggle. Storage
// mirrors themeMode.ts (web localStorage / native SecureStore, every path swallows
// failures). Fail-closed in the nagging direction: a storage READ failure counts as
// already-seen — a broken storage must never re-show the tip on every launch.
const THEME_TIP_SEEN_STORAGE_KEY = 'runningground.homeThemeTipSeen.v1';

function getWebStorage() {
  if (typeof window !== 'undefined' && 'localStorage' in window && window.localStorage) {
    return window.localStorage;
  }

  return null;
}

async function hasSeenThemeTip(): Promise<boolean> {
  const webStorage = getWebStorage();

  if (webStorage) {
    try {
      return webStorage.getItem(THEME_TIP_SEEN_STORAGE_KEY) === 'true';
    } catch {
      return true;
    }
  }

  try {
    if (!(await SecureStore.isAvailableAsync())) {
      return true;
    }

    return (await SecureStore.getItemAsync(THEME_TIP_SEEN_STORAGE_KEY)) === 'true';
  } catch {
    return true;
  }
}

async function markThemeTipSeen(): Promise<void> {
  const webStorage = getWebStorage();

  if (webStorage) {
    try {
      webStorage.setItem(THEME_TIP_SEEN_STORAGE_KEY, 'true');
    } catch {
      // Persistence failure only risks the tip showing once more on a later launch.
    }
    return;
  }

  try {
    if (await SecureStore.isAvailableAsync()) {
      await SecureStore.setItemAsync(THEME_TIP_SEEN_STORAGE_KEY, 'true');
    }
  } catch {
    // Same as above — never let a storage hiccup crash the home screen.
  }
}

// Header geometry (HomeHeader/TabHeader): three 40px icon buttons, 4px gaps, the
// theme toggle is the LEFTMOST — its center sits icon*2 + gap*2 + icon/2 from the
// right edge. Derived from tokens so a header restyle keeps the arrow honest.
const ICON_BUTTON_SIZE = spacing.s20 * 2;
const ICON_BUTTON_GAP = spacing.sm;
const ARROW_HALF_WIDTH = 7;
const ARROW_CENTER_FROM_RIGHT = ICON_BUTTON_SIZE * 2 + ICON_BUTTON_GAP * 2 + ICON_BUTTON_SIZE / 2;

export function HomeThemeTipBubble() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void hasSeenThemeTip().then((seen) => {
      if (seen || cancelled) {
        return;
      }

      setVisible(true);
      // Mark seen the moment it renders: the toggle itself reloads the whole JS
      // bundle, so waiting for an explicit dismiss would re-show it after every
      // theme switch on this first session.
      void markThemeTipSeen();
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.arrow} />
      <Pressable
        accessibilityLabel="테마 안내 닫기"
        accessibilityRole="button"
        onPress={() => setVisible(false)}
        style={styles.bubble}
      >
        <Text style={styles.text}>여기서 다크 모드와 라이트 모드를 바꿀 수 있어요!</Text>
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
    marginRight: ARROW_CENTER_FROM_RIGHT - ARROW_HALF_WIDTH,
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
