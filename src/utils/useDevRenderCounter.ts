import { useEffect, useRef } from 'react';

const DEV_RENDER_COUNTER_WINDOW_MS = 10_000;

export function useDevRenderCounter(label: string) {
  const labelRef = useRef(label);
  const windowRenderCountRef = useRef(0);
  const totalRenderCountRef = useRef(0);

  labelRef.current = label;

  // Diagnostic-only render counter. This must stay __DEV__-only so preview/production builds are unaffected.
  if (__DEV__) {
    windowRenderCountRef.current += 1;
    totalRenderCountRef.current += 1;
  }

  useEffect(() => {
    if (!__DEV__) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      const windowRenders = windowRenderCountRef.current;
      windowRenderCountRef.current = 0;

      if (windowRenders <= 0) {
        return;
      }

      console.info(
        `[RG render/10s] ${labelRef.current}: ${windowRenders} renders (total ${totalRenderCountRef.current})`,
      );
    }, DEV_RENDER_COUNTER_WINDOW_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, []);
}
