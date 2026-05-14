import { useEffect, useRef } from 'react';

type UseStaleMatchCleanupInput = {
  refreshStaleMatchArtifacts: () => Promise<void>;
};

export function useStaleMatchCleanup({
  refreshStaleMatchArtifacts,
}: UseStaleMatchCleanupInput) {
  const refreshRef = useRef(refreshStaleMatchArtifacts);
  refreshRef.current = refreshStaleMatchArtifacts;

  useEffect(() => {
    void refreshRef.current().catch(() => {});
  }, []);
}
