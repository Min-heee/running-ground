import { useCallback, useEffect, useRef, useState } from 'react';

import { getApiErrorMessage } from '@/services/apiError';
import { searchUniverse } from '@/services/universeService';
import type { UniverseSearchResult } from '@/lib/api/types';

// 아이디 검색 (오너 2026-08-15: "검색창에 아이디를 치면 그 행성·항성으로 가고").
//
// 타자마다 서버를 때리지 않도록 디바운스하고, **응답 순서가 뒤바뀌어도** 화면이 옛 결과로
// 되돌아가지 않게 요청마다 일련번호를 붙인다. '민'→'민병'을 빠르게 치면 앞 요청이 늦게
// 도착할 수 있고, 그때 최신 결과를 덮어쓰면 방금 친 글자와 목록이 어긋난다.

const SEARCH_DEBOUNCE_MS = 260;
// 백엔드와 같은 최소 길이 — 여기서 먼저 걸러 헛된 왕복을 없앤다.
export const UNIVERSE_SEARCH_MIN_LENGTH = 2;

export function useUniverseSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UniverseSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeqRef = useRef(0);
  const latestAppliedSeqRef = useRef(0);

  const clear = useCallback(() => {
    // 진행 중인 응답이 나중에 도착해 목록을 되살리지 못하게 순번을 끌어올린다.
    requestSeqRef.current += 1;
    latestAppliedSeqRef.current = requestSeqRef.current;
    setQuery('');
    setResults([]);
    setSearching(false);
    setError(null);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < UNIVERSE_SEARCH_MIN_LENGTH) {
      setResults([]);
      setSearching(false);
      setError(null);
      return undefined;
    }

    setSearching(true);
    const timer = setTimeout(() => {
      requestSeqRef.current += 1;
      const seq = requestSeqRef.current;

      searchUniverse(trimmed)
        .then((response) => {
          if (seq < latestAppliedSeqRef.current) {
            return;
          }

          latestAppliedSeqRef.current = seq;
          setResults(response.results);
          setError(null);
        })
        .catch((searchError) => {
          if (seq < latestAppliedSeqRef.current) {
            return;
          }

          latestAppliedSeqRef.current = seq;
          setResults([]);
          setError(getApiErrorMessage(searchError, '검색하지 못했어요.'));
        })
        .finally(() => {
          if (seq >= latestAppliedSeqRef.current) {
            setSearching(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  return { query, setQuery, results, searching, error, clear };
}
