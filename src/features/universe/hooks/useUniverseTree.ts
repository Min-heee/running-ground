import { useCallback, useEffect, useRef, useState } from 'react';

import { getApiErrorMessage } from '@/services/apiError';
import { fetchUniverse } from '@/services/universeService';
import type {
  UniverseBody,
  UniverseMe,
  UniverseNode,
  UniversePlanet,
  UniverseResponse,
} from '@/lib/api/types';
import { useAndroidDeferredEffect } from '@/utils/useAndroidDeferredInteractionEffect';

// 우주 전체를 하나의 나무로 들고 있는다 — 다만 **보이는 만큼만** 채운다.
//
// 전국 250개 지역 × 회원 전부를 한 번에 받을 수는 없다. 그래서 화면이 "이 천체가 풀릴 만큼
// 커졌다"고 알려줄 때만 그 안을 받아 온다. 한 번 받은 것은 캐시에 남는다 — 축소했다가 다시
// 확대할 때 같은 요청이 반복되면 확대 자체가 끊긴다.
//
// 이게 층 전환(예전 구조)과 다른 점: 받아온 자식은 부모를 **대체하지 않고** 부모 안에 쌓인다.
// 그래서 확대는 화면을 갈아끼우는 게 아니라 이미 있던 것이 풀리는 일이 된다.

const UNIVERSE_INITIAL_FETCH_DEFER_MS = 120;
// 동시에 날리는 요청 수 — 한 배율에서 여러 은하가 동시에 풀리므로 상한이 없으면 몰린다.
const MAX_IN_FLIGHT = 4;
// 실패한 노드를 다시 열어 보기까지 쉬는 시간.
const RETRY_AFTER_FAILURE_MS = 6000;

export type TreeEntry = {
  node: UniverseNode;
  // 하위 지역(있으면) 또는 회원 행성(리프면). 둘 중 하나만 찬다.
  bodies: UniverseBody[];
  planets: UniversePlanet[];
  // 최상위부터 이 노드까지의 id — 검색·워프가 조상 사슬을 채울 때 쓴다.
  path: string[];
};

function toEntry(response: UniverseResponse): TreeEntry {
  return {
    node: response.node,
    bodies: response.bodies ?? [],
    planets: response.galaxy?.planets ?? [],
    path: (response.breadcrumb ?? []).map((crumb) => crumb.id),
  };
}

export function useUniverseTree() {
  const entriesRef = useRef(new Map<string, TreeEntry>());
  const inFlightRef = useRef(new Set<string>());
  const queueRef = useRef<string[]>([]);
  // 실패한 노드 → 다시 시도해도 되는 시각.
  const failedRef = useRef(new Map<string, number>());
  const [rootId, setRootId] = useState<string | null>(null);
  const [me, setMe] = useState<UniverseMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const bump = useCallback(() => {
    if (mountedRef.current) {
      setRevision((count) => count + 1);
    }
  }, []);

  const pump = useCallback(() => {
    while (inFlightRef.current.size < MAX_IN_FLIGHT && queueRef.current.length > 0) {
      const nodeId = queueRef.current.shift();

      if (!nodeId || entriesRef.current.has(nodeId) || inFlightRef.current.has(nodeId)) {
        continue;
      }

      inFlightRef.current.add(nodeId);

      fetchUniverse(nodeId)
        .then((response) => {
          entriesRef.current.set(nodeId, toEntry(response));
          bump();
        })
        .catch(() => {
          // 한 가지를 못 받아도 우주는 계속 돈다. 다만 곧바로 다시 부르지는 않는다 — 확대할
          // 때마다 같은 실패를 반복하면 네트워크가 끊긴 채 요청 폭풍이 된다.
          //
          // 영구 차단도 안 된다: 터널을 지나는 동안 한 번 실패했다고 그 지역이 앱을 껐다 켤
          // 때까지 영영 안 열리면, 사용자에겐 "저 은하만 고장 난" 우주가 된다. 잠깐 쉬었다
          // 다시 열어 준다.
          failedRef.current.set(nodeId, Date.now() + RETRY_AFTER_FAILURE_MS);
        })
        .finally(() => {
          inFlightRef.current.delete(nodeId);
          pump();
        });
    }
  }, [bump]);

  // 화면이 "이 안이 필요하다"고 알려주는 통로. 렌더 중에 불려도 안전해야 한다(상태를 안 만짐).
  const request = useCallback((nodeId: string) => {
    const retryAt = failedRef.current.get(nodeId);

    if (retryAt !== undefined) {
      if (Date.now() < retryAt) {
        return;
      }

      failedRef.current.delete(nodeId);
    }

    if (
      entriesRef.current.has(nodeId)
      || inFlightRef.current.has(nodeId)
      || queueRef.current.includes(nodeId)
    ) {
      return;
    }

    queueRef.current.push(nodeId);
    pump();
  }, [pump]);

  const entryFor = useCallback((nodeId: string) => entriesRef.current.get(nodeId) ?? null, []);

  const loadRoot = useCallback(() => {
    setLoading(true);
    setError(null);

    fetchUniverse()
      .then((response) => {
        if (!mountedRef.current) {
          return;
        }

        const entry = toEntry(response);
        entriesRef.current.set(entry.node.id, entry);
        setRootId(entry.node.id);
        setMe(response.me);
        bump();
      })
      .catch((loadError) => {
        if (mountedRef.current) {
          setError(getApiErrorMessage(loadError, '우주를 불러오지 못했어요.'));
        }
      })
      .finally(() => {
        if (mountedRef.current) {
          setLoading(false);
        }
      });
  }, [bump]);

  // 특정 노드까지의 조상 사슬을 전부 채운다 — 검색 착지·'내 행성으로'가 좌표를 계산하려면
  // 중간 층이 모두 있어야 한다(좌표는 부모 안에서만 정해지므로).
  const ensurePath = useCallback(async (nodeId: string): Promise<string[] | null> => {
    try {
      let entry = entriesRef.current.get(nodeId) ?? null;

      if (!entry) {
        entry = toEntry(await fetchUniverse(nodeId));
        entriesRef.current.set(nodeId, entry);
      }

      const { path } = entry;

      await Promise.all(path.map(async (ancestorId) => {
        if (entriesRef.current.has(ancestorId)) {
          return;
        }

        const response = await fetchUniverse(ancestorId);
        entriesRef.current.set(ancestorId, toEntry(response));
      }));

      bump();
      return path;
    } catch {
      return null;
    }
  }, [bump]);

  useAndroidDeferredEffect(() => {
    loadRoot();
  }, [loadRoot], {
    delayMs: UNIVERSE_INITIAL_FETCH_DEFER_MS,
    source: 'universe screen model',
    tab: 'universe',
    traceInitialFetch: true,
    work: 'universe fetch',
  });

  const retry = useCallback(() => {
    failedRef.current.clear();
    loadRoot();
  }, [loadRoot]);

  return {
    rootId,
    me,
    loading,
    error,
    // 이 값이 바뀌면 새 자식이 도착했다는 뜻 — 화면이 다시 그린다.
    revision,
    entryFor,
    request,
    ensurePath,
    retry,
  };
}
