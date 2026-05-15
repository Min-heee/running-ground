import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { ActivityIndicator, InteractionManager, StyleSheet, Text, View } from 'react-native';
import type {
  TrackRunExperienceRuntimeProps,
} from '@/features/runs/runtime/TrackRunExperienceRuntimeModel';
import {
  getRunningTabRuntimeInitialMountDelayMs,
  shouldDeferRunningTabRuntimeInitialMount,
} from '@/features/runs/runtime/runningTabInitialLoadPolicy';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { Screen } from '@/components/Screen';
import { rgPerfMark } from '@/utils/rgPerfTrace';

type RuntimeComponent = ComponentType<TrackRunExperienceRuntimeProps>;

let loadedRuntimeComponent: RuntimeComponent | null = null;
let runtimeLoadPromise: Promise<RuntimeComponent> | null = null;

function loadRuntimeComponent() {
  if (loadedRuntimeComponent) {
    return Promise.resolve(loadedRuntimeComponent);
  }

  if (!runtimeLoadPromise) {
    runtimeLoadPromise = import('@/features/runs/runtime/TrackRunExperienceRuntimeModel')
      .then((module) => {
        loadedRuntimeComponent = module.TrackRunExperienceRuntime;
        rgPerfMark('running tab live runtime lazy loaded', {
          source: 'track-run runtime loader',
        });
        return loadedRuntimeComponent;
      });
  }

  return runtimeLoadPromise;
}

export type { TrackRunExperienceRuntimeProps };

export function TrackRunExperienceRuntime(props: TrackRunExperienceRuntimeProps) {
  const [Runtime, setRuntime] = useState<RuntimeComponent | null>(() => loadedRuntimeComponent);
  const shouldDeferRuntime = shouldDeferRunningTabRuntimeInitialMount(props);
  const runtimeDeferDelayMs = getRunningTabRuntimeInitialMountDelayMs(props);

  useEffect(() => {
    if (Runtime) {
      rgPerfMark('running tab first mount ready', {
        routeShellHint: props.routeShellHint ?? null,
        source: 'track-run runtime loader',
      });
      return;
    }

    let canceled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const loadRuntime = () => {
      void loadRuntimeComponent().then((component) => {
        if (canceled) {
          return;
        }

        setRuntime(() => component);
      });
    };

    if (shouldDeferRuntime) {
      rgPerfMark('running tab heavy runtime deferred', {
        delayMs: runtimeDeferDelayMs,
        routeShellHint: props.routeShellHint ?? null,
        source: 'track-run runtime loader',
      });
      const interactionTask = InteractionManager.runAfterInteractions(() => {
        timeoutId = setTimeout(loadRuntime, runtimeDeferDelayMs);
      });

      return () => {
        canceled = true;
        interactionTask.cancel?.();
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };
    }

    loadRuntime();

    return () => {
      canceled = true;
    };
  }, [Runtime, props.routeShellHint, runtimeDeferDelayMs, shouldDeferRuntime]);

  if (!Runtime) {
    return (
      <RunningTabInitialShell
        isTabMode={props.mode === 'tab'}
      />
    );
  }

  return <Runtime {...props} />;
}

function RunningTabInitialShell({
  isTabMode,
}: {
  isTabMode: boolean;
}) {
  useEffect(() => {
    rgPerfMark('running tab initial shell mounted', {
      source: 'track-run runtime loader',
    });

    const readyTimeoutId = setTimeout(() => {
      rgPerfMark('running tab first mount ready', {
        phase: 'initial-shell',
        source: 'track-run runtime loader',
      });
    }, 0);

    return () => {
      clearTimeout(readyTimeoutId);
    };
  }, []);

  return (
    <Screen>
      <AuthHeader
        title="실시간 러닝"
        showBack={!isTabMode}
        backHref="/"
      />
      <View style={styles.initialCard}>
        <ActivityIndicator size="small" color="#6D5EF7" />
        <Text style={styles.initialText}>러닝 화면을 준비 중이에요.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  initialCard: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 24,
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  initialText: {
    color: '#D6D9F9',
    fontSize: 14,
    fontWeight: '700',
  },
});
