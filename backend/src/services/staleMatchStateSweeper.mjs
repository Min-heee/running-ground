// 유령 매칭 상태 청소기 (오너 2026-07-31: "대기실 오래되면 아예 삭제되어야지").
//
// 왜 필요한가: prune(대기방/세션/큐 만료 정리)은 지금까지 전부 '지연 실행'이었다 — 누군가
// 방 API를 건드릴 때만 돌았다. 그래서 만든 사람이 앱을 다시 안 열면 만료된 대기방이
// 스토어에 그대로 남았고, 관리자 라이브 화면에는 '대기 중인 파티방'으로 계속 보였다.
// 만료를 시간이 아니라 '누군가의 요청'에 의존시키면 안 된다. 서버가 스스로 지운다.
//
// 비용 계약: mutateStore는 직렬화 결과가 이전과 같으면 저장 파이프라인을 통째로 건너뛴다.
// 지울 게 없는 대부분의 주기는 blob 비교 한 번으로 끝나고 파일 쓰기/백업이 없다(#209).

import { pruneMatchQueues } from '../lib/matchQueueStoreHelpers.mjs';
import { pruneMatchRooms } from '../lib/matchRoom/matchRoomCore.mjs';
import { pruneMatchSessions } from '../lib/runningMatchSession/matchSessionLifecycle.mjs';
import {
  pruneRunmadangChallenges,
  settleDueRunmadangChallenges,
} from '../lib/runmadang/runmadang.mjs';

// 5분: 대기방 수명(2시간)에 비해 충분히 촘촘하면서, 주기당 비용(blob 직렬화 1회)이 무의미한 간격.
export const MATCH_STATE_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

function countQueueEntries(store) {
  const queues = store?.matchQueues ?? {};
  return ['duel', 'group'].reduce((total, mode) => total + (queues[mode]?.length ?? 0), 0);
}

// 한 번 쓸어담기 — 지워진 개수를 돌려준다(전부 0이면 스토어는 그대로다).
export async function sweepStaleMatchState({ mutateStore, now = new Date() }) {
  return mutateStore((store) => {
    const beforeRooms = store.matchRooms?.length ?? 0;
    const beforeSessions = store.matchSessions?.length ?? 0;
    const beforeQueueEntries = countQueueEntries(store);

    pruneMatchQueues(store, now);
    pruneMatchSessions(store, now);
    pruneMatchRooms(store, now);
    // 그라운드: 만기 판 정산(환불·상금·알림) + 오래된 판 정리 — 아무도 앱을 안 열어도
    // 기간이 끝나면 결과가 나가야 한다.
    const settledRunmadang = settleDueRunmadangChallenges(store, now);
    pruneRunmadangChallenges(store, now);

    return {
      removedRooms: beforeRooms - (store.matchRooms?.length ?? 0),
      removedSessions: beforeSessions - (store.matchSessions?.length ?? 0),
      removedQueueEntries: beforeQueueEntries - countQueueEntries(store),
      settledRunmadang,
    };
  });
}

// 서버 부팅 시 1회 호출. 반환된 stop()으로 멈춘다(테스트/종료용).
export function startStaleMatchStateSweeper({
  intervalMs = MATCH_STATE_SWEEP_INTERVAL_MS,
  mutateStore,
  onSwept = null,
  onError = null,
}) {
  let sweepInFlight = false;

  const runSweep = async () => {
    // 이전 주기가 아직 안 끝났으면 건너뛴다 — 단일 라이터 큐에 청소 작업이 쌓이면
    // 유저 요청(러닝 저장/매치 진행)이 그 뒤에 줄 서게 된다.
    if (sweepInFlight) {
      return;
    }

    sweepInFlight = true;

    try {
      const swept = await sweepStaleMatchState({ mutateStore, now: new Date() });

      if (onSwept && (swept.removedRooms || swept.removedSessions || swept.removedQueueEntries || swept.settledRunmadang)) {
        onSwept(swept);
      }
    } catch (error) {
      // 청소 실패가 서버를 죽이면 안 된다 — 다음 주기에 다시 시도한다.
      onError?.(error);
    } finally {
      sweepInFlight = false;
    }
  };

  const timer = setInterval(() => {
    void runSweep();
  }, intervalMs);

  // 청소 타이머가 프로세스 종료를 붙잡지 않게.
  timer.unref?.();

  return {
    stop: () => clearInterval(timer),
    // 부팅 직후 한 번 즉시 쓸고 싶을 때(그리고 테스트에서) 쓰는 손잡이.
    sweepNow: runSweep,
  };
}
