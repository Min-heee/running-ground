import { useCallback, useEffect, type DependencyList, type EffectCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { InteractionManager, Platform } from 'react-native';

type EffectCleanup = ReturnType<EffectCallback>;

function isCleanup(value: EffectCleanup): value is () => void {
  return typeof value === 'function';
}

function runAfterAndroidInteractions(effect: EffectCallback) {
  let canceled = false;
  let cleanup: EffectCleanup;

  const runEffect = () => {
    if (canceled) {
      return;
    }

    cleanup = effect();
  };

  if (Platform.OS === 'android') {
    const task = InteractionManager.runAfterInteractions(runEffect);
    return () => {
      canceled = true;
      task.cancel?.();
      if (isCleanup(cleanup)) {
        cleanup();
      }
    };
  }

  runEffect();
  return () => {
    canceled = true;
    if (isCleanup(cleanup)) {
      cleanup();
    }
  };
}

// Android only: keep the first tab frame light, then start API/polling work after navigation settles.
export function useAndroidDeferredEffect(effect: EffectCallback, deps: DependencyList) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => runAfterAndroidInteractions(effect), deps);
}

export function useAndroidDeferredFocusEffect(effect: EffectCallback, deps: DependencyList) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => runAfterAndroidInteractions(effect), deps));
}
