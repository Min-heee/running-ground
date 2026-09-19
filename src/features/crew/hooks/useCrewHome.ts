import { useCallback, useEffect, useRef, useState } from 'react';

import type { CrewHomeResponse } from '@/lib/api/types/crew';
import { fetchCrewHome } from '@/services';
import { getCrewErrorMessage } from '../crewModel';

// 크루 홈 페이로드 한 벌 — 크루 탭·가입·만들기·관리 화면이 같이 쓴다.
//
// 경합 가드 (그라운드 화면과 같은 교훈, 적대 리뷰): 액션(가입·나가기·내보내기…) 응답이 도착한
// 뒤, 그보다 먼저 떠난 조회 응답이 늦게 도착해 화면을 낡은 상태로 되돌릴 수 있다. 액션 응답을
// 반영할 때 세대(dataSeqRef)를 올려서 이전 세대 조회 응답을 버린다.
//
// 화면마다 인스턴스가 따로다(탭·내 크루·관리·가입·만들기). 액션 응답을 부른 화면에만 반영하면 뒤에
// 깔린 크루 탭이 낡은 상태를 들고 있다 (적대 리뷰 2026-09-19: 내 크루 화면에서 나가도 탭엔 옛 내
// 크루 카드가 남고, 재조회가 실패하면 그대로 굳었다). 그래서 액션 응답은 떠 있는 모든 인스턴스에
// 뿌린다 — 받는 쪽도 세대를 올려 그보다 먼저 떠난 조회 응답을 버린다.
const crewHomeListeners = new Set<(response: CrewHomeResponse) => void>();

export function useCrewHome() {
  const [home, setHome] = useState<CrewHomeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // '지금' — 신입 합류 태그(10/9 합류)를 가르는 기준. 렌더마다 Date.now()를 읽으면 memo 행이
  // 매번 다른 값을 받는다. 데이터가 바뀔 때만 다시 읽는다.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const hasLoadedRef = useRef(false);
  const dataSeqRef = useRef(0);

  const receiveHome = useCallback((response: CrewHomeResponse) => {
    dataSeqRef.current += 1;
    hasLoadedRef.current = true;
    setHome(response);
    setNowMs(Date.now());
    setError(null);
  }, []);

  useEffect(() => {
    crewHomeListeners.add(receiveHome);
    return () => {
      crewHomeListeners.delete(receiveHome);
    };
  }, [receiveHome]);

  const applyHome = useCallback((response: CrewHomeResponse) => {
    // 첫 커밋 전(효과 등록 전)에 불려도 자기 자신은 반영한다.
    if (!crewHomeListeners.has(receiveHome)) {
      receiveHome(response);
    }
    crewHomeListeners.forEach((listener) => listener(response));
  }, [receiveHome]);

  const loadHome = useCallback(async () => {
    const seq = dataSeqRef.current;

    try {
      const response = await fetchCrewHome();

      if (seq !== dataSeqRef.current) {
        return; // 이 응답보다 새로운 액션 결과가 이미 반영됨
      }

      hasLoadedRef.current = true;
      setHome(response);
      setNowMs(Date.now());
      setError(null);
    } catch (loadError) {
      // 이미 받아 둔 화면이 있으면 재조회 실패는 조용히 삼킨다 — 에러 줄이 끼어들면 레이아웃이 튄다.
      if (!hasLoadedRef.current) {
        setError(getCrewErrorMessage(loadError, '크루 정보를 불러오지 못했어요.'));
      }
    }
  }, []);

  return { home, error, nowMs, loadHome, applyHome };
}
