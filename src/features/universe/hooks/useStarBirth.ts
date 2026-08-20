import { useCallback, useEffect, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

// 별 탄생 (오너 2026-08-16: "로그인하고 기록연동 딱 하면 별 생성중 뜨면서 딱 자기 별이
// 만들어지고, 자기 별에서 점점 멀어질수록 갤럭시가 보이고").
//
// 우주 탭을 처음 여는 순간이 그 순간이다 — 별은 기록에서 만들어지고, 기록이 사는 곳이
// 여기니까. 한 사람당 딱 한 번. 두 번째부터는 그냥 우주가 열린다.
//
// 저장 실패는 '이미 봤다'로 읽는다(HomeThemeTipBubble과 같은 방향): 고장난 저장소 때문에
// 실행할 때마다 탄생 연출이 반복되면 그건 축하가 아니라 방해다.

const STORAGE_PREFIX = 'runningground.universe.starBirth.v1';

function storageKeyFor(userId: string) {
  return `${STORAGE_PREFIX}.${userId}`;
}

function getWebStorage() {
  if (typeof window !== 'undefined' && 'localStorage' in window && window.localStorage) {
    return window.localStorage;
  }

  return null;
}

async function hasSeenBirth(userId: string): Promise<boolean> {
  const key = storageKeyFor(userId);
  const webStorage = getWebStorage();

  if (webStorage) {
    try {
      return webStorage.getItem(key) === 'true';
    } catch {
      return true;
    }
  }

  try {
    if (!(await SecureStore.isAvailableAsync())) {
      return true;
    }

    return (await SecureStore.getItemAsync(key)) === 'true';
  } catch {
    return true;
  }
}

async function markBirthSeen(userId: string): Promise<void> {
  const key = storageKeyFor(userId);
  const webStorage = getWebStorage();

  if (webStorage) {
    try {
      webStorage.setItem(key, 'true');
    } catch {
      // 저장 실패는 다음 실행에서 한 번 더 보이는 정도의 대가만 남긴다.
    }
    return;
  }

  try {
    if (await SecureStore.isAvailableAsync()) {
      await SecureStore.setItemAsync(key, 'true');
    }
  } catch {
    // 위와 같다.
  }
}

export function useStarBirth({
  userId,
  hasGalaxy,
}: {
  userId: string | null | undefined;
  // 소속 은하가 있어야 별이 있다 — 지역 미설정이면 만들어질 자리가 없다.
  hasGalaxy: boolean;
}) {
  const [showing, setShowing] = useState(false);
  const startedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || !hasGalaxy || startedRef.current === userId) {
      return;
    }

    startedRef.current = userId;
    let cancelled = false;

    void hasSeenBirth(userId).then((seen) => {
      if (!cancelled && !seen) {
        setShowing(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [hasGalaxy, userId]);

  const finish = useCallback(() => {
    setShowing(false);

    if (userId) {
      void markBirthSeen(userId);
    }
  }, [userId]);

  return { showing, finish };
}
