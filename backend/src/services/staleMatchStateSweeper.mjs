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
import { syncMatchRooms } from '../lib/matchRoom/matchRoomSync.mjs';
import { pruneMatchSessions } from '../lib/runningMatchSession/matchSessionLifecycle.mjs';
import {
  pruneRunmadangChallenges,
  settleDueRunmadangChallenges,
} from '../lib/runmadang/runmadang.mjs';
import { pruneCrewStore } from '../lib/crew/crewMembership.mjs';
import { sweepCrewSeasons } from '../lib/crew/crewSeason.mjs';

// 5분: 대기방 수명(2시간)에 비해 충분히 촘촘하면서, 주기당 비용(blob 직렬화 1회)이 무의미한 간격.
export const MATCH_STATE_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

function countQueueEntries(store) {
  const queues = store?.matchQueues ?? {};
  return ['duel', 'group'].reduce((total, mode) => total + (queues[mode]?.length ?? 0), 0);
}

function collectUnlinkedRoomIds(store) {
  return new Set((store?.matchRooms ?? []).filter((room) => room && !room.linkedMatchId).map((room) => room.id));
}

// 한 번 쓸어담기 — 지워진 개수를 돌려준다(전부 0이면 스토어는 그대로다).
export async function sweepStaleMatchState({ mutateStore, now = new Date() }) {
  return mutateStore((store) => {
    const beforeRooms = store.matchRooms?.length ?? 0;
    const beforeSessions = store.matchSessions?.length ?? 0;
    const beforeQueueEntries = countQueueEntries(store);
    const unlinkedRoomIdsBefore = collectUnlinkedRoomIds(store);

    pruneMatchQueues(store, now);
    pruneMatchSessions(store, now);
    // prune만이 아니라 sync — 예약 파티런의 링크(세션 생성)와 방장 시작 방의 카운트다운 무장은
    // 누군가의 요청이 아니라 서버 시계가 결정해야 한다 (2026-09-09). syncMatchRooms가 prune을
    // 먼저 돌리므로 예전의 pruneMatchRooms 호출을 그대로 품는다.
    syncMatchRooms(store, now);
    // 그라운드: 만기 판 정산(환불·상금·알림) + 오래된 판 정리 — 아무도 앱을 안 열어도
    // 기간이 끝나면 결과가 나가야 한다.
    const settledRunmadang = settleDueRunmadangChallenges(store, now);
    pruneRunmadangChallenges(store, now);
    // 크루대전 (2026-09-18): 유예(1h)가 지난 시즌 봉인 + 아침 9시가 된 결과 알림 + 오래된 크루·멤버십
    // 행·가입 신청 정리 — 크루 탭을 아무도 안 열어도 달이 바뀌면 별이 붙는다.
    const sealedCrewSeasons = sweepCrewSeasons(store, now).length;
    const prunedCrewRows = pruneCrewStore(store, now);

    return {
      removedRooms: beforeRooms - (store.matchRooms?.length ?? 0),
      removedSessions: beforeSessions - (store.matchSessions?.length ?? 0),
      removedQueueEntries: beforeQueueEntries - countQueueEntries(store),
      linkedRooms: (store.matchRooms ?? []).filter((room) => room?.linkedMatchId && unlinkedRoomIdsBefore.has(room.id)).length,
      settledRunmadang,
      sealedCrewSeasons,
      prunedCrewRows,
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

      if (onSwept && (swept.removedRooms || swept.removedSessions || swept.removedQueueEntries || swept.linkedRooms || swept.settledRunmadang
        || swept.sealedCrewSeasons || swept.prunedCrewRows)) {
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
