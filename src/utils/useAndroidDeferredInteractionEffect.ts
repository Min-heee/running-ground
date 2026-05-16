import { useCallback, useEffect, type DependencyList, type EffectCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { InteractionManager, Platform } from 'react-native';
import { rgPerfMark } from '@/utils/rgPerfTrace';

type EffectCleanup = ReturnType<EffectCallback>;
type DeferredInteractionOptions = {
  delayMs?: number;
  source?: string;
  tab?: string;
  traceInitialFetch?: boolean;
  work?: string;
};

const deferredWorkWarmKeys = new Set<string>();

function isCleanup(value: EffectCleanup): value is () => void {
  return typeof value === 'function';
}

function getDeferredWorkKey(options?: DeferredInteractionOptions) {
  if (!options?.tab && !options?.work) {
    return null;
  }

  return `${options.tab ?? 'unknown-tab'}:${options.work ?? 'work'}`;
}

function traceDeferredWork(options?: DeferredInteractionOptions) {
  const workKey = getDeferredWorkKey(options);
  const warmPath = workKey ? deferredWorkWarmKeys.has(workKey) : false;

  if (workKey && !warmPath) {
    deferredWorkWarmKeys.add(workKey);
  }

  rgPerfMark('tab heavy work deferred', {
    delayMs: options?.delayMs ?? 0,
    source: options?.source ?? 'android deferred interaction effect',
    tab: options?.tab,
    warmPath,
    work: options?.work,
  });

  if (options?.traceInitialFetch) {
    rgPerfMark('tab initial data fetch deferred', {
      delayMs: options.delayMs ?? 0,
      source: options.source ?? 'android deferred interaction effect',
      tab: options.tab,
      warmPath,
      work: options.work,
    });
  }

  if (warmPath) {
    rgPerfMark('tab warm path reused', {
      source: options?.source ?? 'android deferred interaction effect',
      tab: options?.tab,
      work: options?.work,
    });
  }
}

function runAfterAndroidInteractions(effect: EffectCallback, options?: DeferredInteractionOptions) {
  let canceled = false;
  let cleanup: EffectCleanup;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const runEffect = () => {
    if (canceled) {
      return;
    }

    cleanup = effect();
  };

  if (Platform.OS === 'android') {
    traceDeferredWork(options);
    const task = InteractionManager.runAfterInteractions(() => {
      if (options?.delayMs && options.delayMs > 0) {
        timeoutId = setTimeout(runEffect, options.delayMs);
        return;
      }

      runEffect();
    });

    return () => {
      canceled = true;
      task.cancel?.();
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
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
export function useAndroidDeferredEffect(
  effect: EffectCallback,
  deps: DependencyList,
  options?: DeferredInteractionOptions,
) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => runAfterAndroidInteractions(effect, options), deps);
}

export function useAndroidDeferredFocusEffect(
  effect: EffectCallback,
  deps: DependencyList,
  options?: DeferredInteractionOptions,
) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => runAfterAndroidInteractions(effect, options), deps));
}
