import { useCallback, useMemo, useRef } from 'react';
import { BackHandler, PanResponder } from 'react-native';
import { useFocusEffect } from 'expo-router';

// iOS-style edge-swipe-back for the region drill-down (대한민국 → 광주 → 동구).
// The drill is in-screen STATE, not a navigation stack, so the OS back gesture
// never fires — this recreates it: a rightward swipe that starts at the left
// edge steps one region level up. One PanResponder works on BOTH platforms, and
// on Android the hardware/gesture back button also steps up (the platform's own
// back idiom) instead of leaving the tab, as long as we are below the root.
const EDGE_START_X = 44;
const TRIGGER_DX = 60;

export function useRegionBackGesture({
  enabled,
  onBack,
}: {
  // False at the 대한민국 root (nothing above) — gesture + back button pass through.
  enabled: boolean;
  onBack: () => void;
}) {
  // Refs so the long-lived responder/back-handler always see fresh values.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  const panHandlers = useMemo(() => PanResponder.create({
    // Capture-phase claim so the horizontal edge swipe wins over the vertical
    // ScrollView — but ONLY for clearly-horizontal moves starting at the edge,
    // so normal scrolling and taps are untouched.
    onMoveShouldSetPanResponderCapture: (_event, gesture) => (
      enabledRef.current
      && gesture.x0 <= EDGE_START_X
      && gesture.dx > 12
      && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2
    ),
    onPanResponderRelease: (_event, gesture) => {
      if (enabledRef.current && gesture.dx > TRIGGER_DX && Math.abs(gesture.dx) > Math.abs(gesture.dy)) {
        onBackRef.current();
      }
    },
    onPanResponderTerminationRequest: () => true,
  }).panHandlers, []);

  // Android back button: step up one region level while drilled in; at the root
  // fall through to the default behavior. Scoped to when this screen is focused.
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (enabledRef.current) {
        onBackRef.current();
        return true;
      }
      return false;
    });

    return () => subscription.remove();
  }, []));

  return panHandlers;
}
