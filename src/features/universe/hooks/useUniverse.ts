import { useCallback, useMemo, useState } from 'react';

import { getApiErrorMessage } from '@/services/apiError';
import { fetchUniverse } from '@/services/universeService';
import type { UniverseResponse } from '@/lib/api/types';
import { useAndroidDeferredEffect } from '@/utils/useAndroidDeferredInteractionEffect';

const UNIVERSE_INITIAL_FETCH_DEFER_MS = 120;

export function useUniverse() {
  const [universe, setUniverse] = useState<UniverseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 마지막으로 연 노드 — 재시도할 때 같은 자리로 돌아오기 위해 들고 있는다.
  const [nodeId, setNodeId] = useState<string | undefined>(undefined);

  const load = useCallback((targetNodeId?: string) => {
    setNodeId(targetNodeId);
    setLoading(true);
    setError(null);

    fetchUniverse(targetNodeId)
      .then((response) => setUniverse(response))
      .catch((loadError) => setError(getApiErrorMessage(loadError, '우주를 불러오지 못했어요.')))
      .finally(() => setLoading(false));
  }, []);

  const breadcrumb = useMemo(() => universe?.breadcrumb ?? [], [universe]);

  // 한 층 위 — 은하단(최상위)에서는 없다.
  const parentNodeId = useMemo(
    () => (breadcrumb.length > 1 ? breadcrumb[breadcrumb.length - 2].id : null),
    [breadcrumb],
  );

  const goBack = useCallback(() => {
    if (!parentNodeId) {
      return false;
    }

    load(parentNodeId);
    return true;
  }, [load, parentNodeId]);

  const warpToMyGalaxy = useCallback(() => {
    const galaxyNodeId = universe?.me.galaxyNodeId;

    if (!galaxyNodeId) {
      return;
    }

    load(galaxyNodeId);
  }, [load, universe]);

  const retry = useCallback(() => load(nodeId), [load, nodeId]);

  useAndroidDeferredEffect(() => {
    load();
  }, [load], {
    delayMs: UNIVERSE_INITIAL_FETCH_DEFER_MS,
    source: 'universe screen model',
    tab: 'universe',
    traceInitialFetch: true,
    work: 'universe fetch',
  });

  return {
    universe,
    loading,
    error,
    breadcrumb,
    canGoBack: parentNodeId !== null,
    openNode: load,
    goBack,
    warpToMyGalaxy,
    retry,
  };
}
