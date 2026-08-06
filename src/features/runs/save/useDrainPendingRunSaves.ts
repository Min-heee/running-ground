import { useEffect } from 'react';
import { AppState } from 'react-native';

import { drainPendingRunSaves } from './pendingRunSaveQueue';
import { rgPerfMark } from '@/utils/rgPerfTrace';

// 앱 진입(탭 레이아웃 마운트) + 백그라운드→포그라운드 복귀 때 저장 대기열을 비운다.
// 드레인 자체가 30초 스로틀·단일 비행이라 여기선 그냥 부르면 된다.
export function useDrainPendingRunSaves() {
  useEffect(() => {
    const drain = () => {
      void drainPendingRunSaves().then((result) => {
        if (result.saved > 0 || result.expired > 0) {
          rgPerfMark('pending run saves drained', {
            saved: result.saved,
            expired: result.expired,
            attempted: result.attempted,
          });
        }
      });
    };

    drain();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        drain();
      }
    });
    return () => subscription.remove();
  }, []);
}
