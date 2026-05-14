import { useEffect, useRef } from 'react';

type UseStaleMatchCleanupInput = {
  enabled?: boolean;
  refreshStaleMatchArtifacts: () => Promise<void>;
};

export function useStaleMatchCleanup({
  enabled = true,
  refreshStaleMatchArtifacts,
}: UseStaleMatchCleanupInput) {
  const refreshRef = useRef(refreshStaleMatchArtifacts);
  refreshRef.current = refreshStaleMatchArtifacts;

  useEffect(() => {
    if (!enabled) {
      return;
    }

    void refreshRef.current().catch(() => {});
  }, [enabled]);
}
