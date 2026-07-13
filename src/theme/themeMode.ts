// Theme mode persistence + the reload-based switch.
//
// The palette is baked into module-scope StyleSheets at import time (see tokens.ts),
// so changing the theme = persist the new mode, then fully reload the JS bundle so
// the root layout re-applies the palette before any screen module is imported.
// Storage mirrors the session util (src/lib/session/storage.ts): localStorage on
// web, expo-secure-store on native, and every path swallows failures — a storage
// hiccup must never crash the app (worst case the user boots back into dark).

import { Alert, DevSettings } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Updates from 'expo-updates';
import {
  applyThemePalette,
  DEFAULT_THEME_MODE,
  getAppliedThemeMode,
  type ThemeMode,
} from '@/theme/tokens';

const THEME_MODE_STORAGE_KEY = 'runningground.themeMode.v1';

// Fail-closed parser: anything that is not exactly 'light' resolves to the dark
// default — fresh installs (null) and corrupted values both boot dark.
export function normalizeStoredThemeMode(value: string | null | undefined): ThemeMode {
  return value === 'light' ? 'light' : DEFAULT_THEME_MODE;
}

function getWebStorage() {
  if (typeof window !== 'undefined' && 'localStorage' in window && window.localStorage) {
    return window.localStorage;
  }

  return null;
}

export async function getStoredThemeMode(): Promise<ThemeMode> {
  const webStorage = getWebStorage();

  if (webStorage) {
    return normalizeStoredThemeMode(webStorage.getItem(THEME_MODE_STORAGE_KEY));
  }

  try {
    if (!(await SecureStore.isAvailableAsync())) {
      return DEFAULT_THEME_MODE;
    }

    return normalizeStoredThemeMode(await SecureStore.getItemAsync(THEME_MODE_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_MODE;
  }
}

export async function setStoredThemeMode(mode: ThemeMode): Promise<void> {
  const webStorage = getWebStorage();

  if (webStorage) {
    webStorage.setItem(THEME_MODE_STORAGE_KEY, mode);
    return;
  }

  try {
    if (await SecureStore.isAvailableAsync()) {
      await SecureStore.setItemAsync(THEME_MODE_STORAGE_KEY, mode);
    }
  } catch {
    // Ignore persistence failures — the reload below still applies the palette for
    // this run via the in-memory mode; next cold start falls back to the stored value.
  }
}

// Reads the stored mode and mutates the exported `colors` object to match. Called
// from the root layout BEFORE the Stack children render, so lazily-imported route
// modules bake the correct palette into their StyleSheets.
export async function hydrateThemePalette(): Promise<ThemeMode> {
  const mode = await getStoredThemeMode();
  applyThemePalette(mode);
  return mode;
}

function reloadAppForThemeChange() {
  if (__DEV__) {
    // expo-updates reloadAsync throws outside a release/updates context. DevSettings
    // is the dev-client equivalent; if even that is unavailable, tell the developer.
    try {
      DevSettings.reload();
    } catch {
      Alert.alert('테마 변경', '앱을 다시 시작하면 테마가 적용돼요.');
    }
    return;
  }

  Updates.reloadAsync().catch(() => {
    // Reload failure is non-fatal — the stored mode applies on the next cold start.
    Alert.alert('테마 변경', '앱을 다시 시작하면 테마가 적용돼요.');
  });
}

// The HOME toggle action: persist the opposite of the currently APPLIED mode, then
// reload immediately (no confirmation — the press is the confirmation). Callers are
// responsible for gating against active runs/matches before invoking (a mid-run
// reload is a catastrophe — same rule as the OTA prompt).
export async function toggleThemeMode(): Promise<void> {
  const nextMode: ThemeMode = getAppliedThemeMode() === 'dark' ? 'light' : 'dark';
  await setStoredThemeMode(nextMode);
  reloadAppForThemeChange();
}
