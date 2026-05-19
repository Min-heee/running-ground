import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { ActivityIndicator, InteractionManager, Platform, StyleSheet, Text, View } from 'react-native';
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
import { colors } from '@/theme/tokens';

type RuntimeComponent = ComponentType<TrackRunExperienceRuntimeProps>;

let loadedRuntimeComponent: RuntimeComponent | null = null;
let runtimeLoadPromise: Promise<RuntimeComponent> | null = null;

function loadRuntimeComponentSynchronously() {
  if (loadedRuntimeComponent) {
    return loadedRuntimeComponent;
  }

  try {
    // iOS TestFlight loads this synchronously to avoid Expo Updates error recovery
    // treating a production dynamic import rejection as a launch-time fatal error.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const runtimeModule = require('../runtime/TrackRunExperienceRuntimeModel') as typeof import('@/features/runs/runtime/TrackRunExperienceRuntimeModel');
    loadedRuntimeComponent = runtimeModule.TrackRunExperienceRuntime;
    rgPerfMark('running tab live runtime lazy loaded', {
      platform: Platform.OS,
      source: 'track-run runtime loader',
      strategy: 'sync-require',
    });
    return loadedRuntimeComponent;
  } catch (error) {
    rgPerfMark('running tab runtime load failed', {
      message: error instanceof Error ? error.message : 'unknown',
      platform: Platform.OS,
      source: 'track-run runtime loader',
      strategy: 'sync-require',
    });
    throw error;
  }
}

function loadRuntimeComponent() {
  if (loadedRuntimeComponent) {
    return Promise.resolve(loadedRuntimeComponent);
  }

  if (Platform.OS === 'ios') {
    return Promise.resolve(loadRuntimeComponentSynchronously());
  }

  if (!runtimeLoadPromise) {
    runtimeLoadPromise = import('@/features/runs/runtime/TrackRunExperienceRuntimeModel')
      .then((module) => {
        loadedRuntimeComponent = module.TrackRunExperienceRuntime;
        rgPerfMark('running tab live runtime lazy loaded', {
          platform: Platform.OS,
          source: 'track-run runtime loader',
          strategy: 'dynamic-import',
        });
        return loadedRuntimeComponent;
      });
  }

  return runtimeLoadPromise;
}

export type { TrackRunExperienceRuntimeProps };

export function TrackRunExperienceRuntime(props: TrackRunExperienceRuntimeProps) {
  const [Runtime, setRuntime] = useState<RuntimeComponent | null>(() => (
    Platform.OS === 'ios' ? loadRuntimeComponentSynchronously() : loadedRuntimeComponent
  ));
  const runtimePolicyInput = {
    focusMatchId: props.focusMatchId,
    focusMatchMode: props.focusMatchMode,
    focusRoomId: props.focusRoomId,
    forceMatchArena: props.forceMatchArena,
    mode: props.mode,
    platform: Platform.OS,
    roomInviteToken: props.roomInviteToken,
    routeShellHint: props.routeShellHint,
  };
  const shouldDeferRuntime = shouldDeferRunningTabRuntimeInitialMount(runtimePolicyInput);
  const runtimeDeferDelayMs = getRunningTabRuntimeInitialMountDelayMs(runtimePolicyInput);

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
        <ActivityIndicator size="small" color={colors.brand} />
        <Text style={styles.initialText}>러닝 화면을 준비 중이에요.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  initialCard: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: 24,
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  initialText: {
    color: colors.lavenderSoft,
    fontSize: 14,
    fontWeight: '700',
  },
});
