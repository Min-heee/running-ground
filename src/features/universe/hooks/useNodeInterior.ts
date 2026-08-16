import { useEffect, useRef, useState } from 'react';

import { fetchUniverse } from '@/services/universeService';
import type { UniverseBody, UniverseGalaxy } from '@/lib/api/types';

// 초점 천체의 '안'을 필요할 때만 가져온다 — 확대해서 그것을 조준했을 때만.
//
// 안이 무엇인지는 층에 따라 다르다: 리프(시/군/구)면 회원 행성들(galaxy.planets), 그 위면
// 하위 지역 천체들(bodies). 화면은 둘을 같은 방식으로 그리므로 여기서 함께 돌려준다 —
// "은하 안엔 행성뿐"이라 가정했다가 도(道) 단계에서 아무것도 안 열리던 구멍을 막는다.
//
// 전부 미리 받지 않는 이유: 전국이면 250개 지역 × 회원이라 한 번에 못 든다. 대신 한 번 받은
// 노드는 캐시에 남겨 축소·재확대에서 다시 부르지 않는다(줌이 문턱을 오갈 때 요청이 튀지 않게).

export type NodeInterior = {
  galaxy: UniverseGalaxy | null;
  bodies: UniverseBody[];
};

const EMPTY: NodeInterior = { galaxy: null, bodies: [] };

export function useNodeInterior(nodeId: string | null): NodeInterior {
  const cacheRef = useRef(new Map<string, NodeInterior>());
  const inFlightRef = useRef(new Set<string>());
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (!nodeId || cacheRef.current.has(nodeId) || inFlightRef.current.has(nodeId)) {
      return;
    }

    inFlightRef.current.add(nodeId);

    fetchUniverse(nodeId)
      .then((response) => {
        cacheRef.current.set(nodeId, {
          galaxy: response.galaxy ?? null,
          bodies: response.bodies ?? [],
        });
        forceRender((count) => count + 1);
      })
      .catch(() => {
        // 안을 못 받아도 천체 자체는 계속 보인다 — 확대가 멈추지 않게 조용히 넘어간다.
      })
      .finally(() => {
        inFlightRef.current.delete(nodeId);
      });
  }, [nodeId]);

  return (nodeId ? cacheRef.current.get(nodeId) : null) ?? EMPTY;
}
