import { useCallback, useEffect, useRef, useState } from 'react';

import type { CrewLeagueResponse } from '@/lib/api/types/crew';
import { fetchCrewLeague } from '@/services';
import { getCrewErrorCode, getCrewErrorMessage, shouldFetchCrewLeague } from '../crewModel';

export type CrewLeagueState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; league: CrewLeagueResponse }
  // 그 시즌 기록 자체가 없음(출시 전 달 등) — 에러가 아니라 빈 상태로 보여준다.
  | { status: 'missing' }
  | { status: 'error'; message: string };

const CURRENT_SEASON_CACHE_KEY = 'current';

// 봉인 전(진행 중·집계 중) 응답은 낡는다 — 봉인된 스냅샷만 영구히 들고 있어도 된다.
function describeCachedLeague(state: CrewLeagueState | undefined): 'none' | 'sealed' | 'unsealed' | 'other' {
  if (!state) {
    return 'none';
  }
  if (state.status === 'ready') {
    return state.league.sealed ? 'sealed' : 'unsealed';
  }
  return 'other';
}

// 시즌별 순위표를 들고 있는다 — '이번 시즌 | 지난 시즌'을 오가도 봉인된 시즌은 다시 안 부른다.
// seasonKey: undefined = 이번 시즌(서버 기본값), null = 부를 시즌이 아직 없음, 'YYYY-MM' = 그 시즌.
//
// 봉인 전 응답은 캐시에 눌러 두지 않는다 (적대 리뷰 2026-09-18): 크루 탭은 lazy + freezeOnBlur라
// 앱을 끄기 전까지 안 내려간다. 11/2에 받은 '10월 시즌 · 집계 중'을 들고 있으면 11/3 0시 봉인 뒤에도
// 우승 줄이 안 뜬다 — 가장 기다린 사람이 가장 늦게 본다. 그래서 봉인 전 응답은
//  - 이 조회가 다시 켜질 때(세그먼트 재진입), 그리고
//  - refreshKey가 바뀔 때(크루 탭: 홈의 lastSeason 키 — 포커스 재조회에서 봉인이 보이면 바뀐다)
// 다시 부른다. 다시 부르는 동안엔 들고 있던 숫자를 그대로 보여 주고, 실패하면 그 숫자를 남긴다.
export function useCrewLeague(
  seasonKey: string | null | undefined,
  enabled: boolean,
  refreshKey: string | null = null,
) {
  const cacheKey = seasonKey === undefined ? CURRENT_SEASON_CACHE_KEY : seasonKey;
  const [states, setStates] = useState<Record<string, CrewLeagueState>>({});
  const requestSeqRef = useRef<Record<string, number>>({});
  // 직전 효과 실행 때의 enabled·refreshKey — '다시 켜짐'과 '키 바뀜'을 가려낸다.
  const lastSeenRef = useRef<{ enabled: boolean; refreshKey: string | null }>({ enabled: false, refreshKey });

  const loadLeague = useCallback(() => {
    if (!cacheKey) {
      return;
    }

    const seq = (requestSeqRef.current[cacheKey] ?? 0) + 1;
    requestSeqRef.current[cacheKey] = seq;
    // 새로 고칠 땐 스피너로 갈아엎지 않는다 — 들고 있는 순위표를 그대로 둔다.
    setStates((current) => (
      current[cacheKey]?.status === 'ready' ? current : { ...current, [cacheKey]: { status: 'loading' } }
    ));

    fetchCrewLeague(seasonKey ?? undefined)
      .then((league) => {
        if (requestSeqRef.current[cacheKey] !== seq) {
          return;
        }
        setStates((current) => ({ ...current, [cacheKey]: { status: 'ready', league } }));
      })
      .catch((loadError) => {
        if (requestSeqRef.current[cacheKey] !== seq) {
          return;
        }
        const nextState: CrewLeagueState = getCrewErrorCode(loadError) === 'not_found'
          ? { status: 'missing' }
          : { status: 'error', message: getCrewErrorMessage(loadError, '크루 순위를 불러오지 못했어요.') };
        setStates((current) => (
          // 새로 고침 실패는 조용히 — 이미 보여 준 순위표를 에러 카드로 바꾸지 않는다.
          current[cacheKey]?.status === 'ready' ? current : { ...current, [cacheKey]: nextState }
        ));
      });
  }, [cacheKey, seasonKey]);

  const currentState = cacheKey ? states[cacheKey] : undefined;
  const cached = describeCachedLeague(currentState);

  useEffect(() => {
    const previous = lastSeenRef.current;
    lastSeenRef.current = { enabled, refreshKey };

    if (cacheKey && shouldFetchCrewLeague({
      enabled,
      cached,
      wasEnabled: previous.enabled,
      refreshKeyChanged: previous.refreshKey !== refreshKey,
    })) {
      loadLeague();
    }
  }, [cacheKey, cached, enabled, loadLeague, refreshKey]);

  return {
    state: currentState ?? ({ status: 'idle' } as CrewLeagueState),
    reload: loadLeague,
  };
}
