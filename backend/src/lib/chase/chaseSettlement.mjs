// 경찰과 도둑런 종료 정산 — chase 러닝이 업로드될 때마다 같은 경기장의 이미 업로드된
// 시간대 겹침 러닝들과 쌍(pair) 단위로 경로를 겹쳐 스침을 판정하고 포인트를 지급한다.
//
// 왜 업로드 시점 소급 정산인가: 아이폰은 화면이 꺼지면 라이브 업로드가 멈추는 OS 제약이
// 있어(백그라운드 동기화 잔여 이슈와 같은 뿌리) 실시간 감지는 놓치는 게 생긴다. 완주 경로는
// 전 구간이 남으므로 나중에 끝난 쪽이 업로드될 때 정산하면 한 건도 놓치지 않는다.
//
// 실행 구조 (2-phase):
//  1) 읽기 단계 — loadStore + (postgres 드라이버) run_routes 사이드 테이블에서 경로를
//     비동기로 모아 순수 판정(detectChaseEncounters)을 돌린다. 뮤테이터는 CPU 작업 없이 가볍게.
//  2) 쓰기 단계 — mutateStore 안에서 쌍 원장(chaseSettledPairs)을 재확인(idempotent)하고
//     상한/쿨다운을 적용해 양쪽 run.chase에 이벤트·보너스를 박제, 상대에게 알림, 메트릭 무효화.
//
// 포인트는 "지급"이 아니라 run.chase.bonusPoints로 박제 → points.mjs가 경쟁 러닝 재계산에
// 합산한다 (매치 보너스와 같은 파생 구조).

import { appendUserNotification } from '../userNotifications.mjs';
import { invalidateUserMetrics } from '../userStoreHelpers.mjs';
import { findChaseArena } from './chaseArenas.mjs';
import {
  CHASE_CATCH_POINTS,
  CHASE_MAX_DAILY_BONUS_POINTS,
  CHASE_MAX_RUN_BONUS_POINTS,
  CHASE_MEET_POINTS,
  CHASE_PAIR_COOLDOWN_MS,
  CHASE_PAIR_LEDGER_TTL_MS,
} from './chaseConstants.mjs';
import { detectChaseEncounters } from './chaseEncounterDetection.mjs';
import { releaseChasePresenceForUser } from './chasePresence.mjs';

function pairKey(runIdA, runIdB) {
  return [runIdA, runIdB].sort().join('|');
}

function ensurePairLedger(store) {
  if (!store.chaseSettledPairs || typeof store.chaseSettledPairs !== 'object') {
    store.chaseSettledPairs = {};
  }

  return store.chaseSettledPairs;
}

function prunePairLedger(store, nowMs) {
  const ledger = ensurePairLedger(store);

  for (const [key, settledAt] of Object.entries(ledger)) {
    if (!(Date.parse(settledAt ?? '') > nowMs - CHASE_PAIR_LEDGER_TTL_MS)) {
      delete ledger[key];
    }
  }

  return ledger;
}

function runTimeOverlaps(run, otherRun) {
  const startA = Date.parse(run.startedAt ?? '');
  const endA = Date.parse(run.endedAt ?? '');
  const startB = Date.parse(otherRun.startedAt ?? '');
  const endB = Date.parse(otherRun.endedAt ?? '');

  if (![startA, endA, startB, endB].every(Number.isFinite)) {
    return false;
  }

  return startA <= endB && startB <= endA;
}

function ensureRunChase(run) {
  if (!run.chase || typeof run.chase !== 'object') {
    return null;
  }

  if (!Number.isFinite(run.chase.bonusPoints)) {
    run.chase.bonusPoints = 0;
  }

  if (!Array.isArray(run.chase.events)) {
    run.chase.events = [];
  }

  return run.chase;
}

// 유저의 해당 날짜(run.date, 기기 KST 달력) chase 보너스 합 — 하루 상한용.
function sumUserChaseBonusForDate(store, userId, dateKey) {
  return store.runs.reduce((total, run) => {
    if (run.userId === userId && run.date === dateKey && Number.isFinite(run.chase?.bonusPoints)) {
      return total + run.chase.bonusPoints;
    }

    return total;
  }, 0);
}

// 두 유저 사이에 이미 기록된 스침 시각들 — 러닝 쌍이 달라도 같은 두 사람이면
// 15분 쿨다운이 이어져야 한다 (겹치는 러닝이 여러 개인 드문 케이스 방어).
function collectExistingPairEventTimes(store, userIdA, userIdB) {
  const times = [];

  for (const run of store.runs) {
    if (run.userId !== userIdA || !Array.isArray(run.chase?.events)) {
      continue;
    }

    for (const event of run.chase.events) {
      if (event.otherUserId === userIdB) {
        const atMs = Date.parse(event.atIso ?? '');

        if (Number.isFinite(atMs)) {
          times.push(atMs);
        }
      }
    }
  }

  return times;
}

function awardPoints({ store, run, user, basePoints }) {
  const chase = ensureRunChase(run);

  if (!chase || basePoints <= 0) {
    return 0;
  }

  const runRemaining = Math.max(0, CHASE_MAX_RUN_BONUS_POINTS - chase.bonusPoints);
  const dailyUsed = sumUserChaseBonusForDate(store, user.id, run.date);
  const dailyRemaining = Math.max(0, CHASE_MAX_DAILY_BONUS_POINTS - dailyUsed);
  return Math.min(basePoints, runRemaining, dailyRemaining);
}

function describeAwards({ catchCount, meetCount, caughtCount, points }) {
  const parts = [];

  if (catchCount > 0) {
    parts.push(`따라잡기 ${catchCount}회`);
  }

  if (meetCount > 0) {
    parts.push(`마주침 ${meetCount}회`);
  }

  if (caughtCount > 0) {
    parts.push(`잡힘 ${caughtCount}회`);
  }

  const summary = parts.length > 0 ? parts.join(' · ') : '스침 없음';
  return points > 0 ? `${summary} · +${points}P` : summary;
}

// deps: { loadStore, mutateStore, getStoredRunRoute } — 라우트에서 주입 (테스트는 페이크).
export async function settleChaseRunUpload({ runId, deps }) {
  const { loadStore, mutateStore, getStoredRunRoute } = deps;

  // ---- 1) 읽기 + 순수 판정 ----
  const store = await loadStore();
  const uploadedRun = store.runs.find((run) => run.id === runId);
  const arena = findChaseArena(uploadedRun?.chase?.arenaId);

  if (!uploadedRun || !arena) {
    return null;
  }

  const baseSummary = {
    arenaId: arena.id,
    arenaName: arena.name,
    newEvents: [],
    totalBonusPoints: uploadedRun.chase?.bonusPoints ?? 0,
  };

  if (uploadedRun.integrity?.verdict === 'vehicle') {
    return baseSummary;
  }

  const uploaderRoute = Array.isArray(uploadedRun.route)
    ? uploadedRun.route
    : await getStoredRunRoute(uploadedRun.id);

  if (!Array.isArray(uploaderRoute) || uploaderRoute.length < 2) {
    return baseSummary;
  }

  const ledgerSnapshot = store.chaseSettledPairs ?? {};
  const candidates = store.runs.filter(
    (run) =>
      run.id !== uploadedRun.id &&
      run.userId !== uploadedRun.userId &&
      run.chase?.arenaId === arena.id &&
      run.integrity?.verdict !== 'vehicle' &&
      runTimeOverlaps(uploadedRun, run) &&
      !ledgerSnapshot[pairKey(uploadedRun.id, run.id)],
  );

  const pairDetections = [];

  for (const candidate of candidates) {
    const candidateRoute = Array.isArray(candidate.route)
      ? candidate.route
      : await getStoredRunRoute(candidate.id);

    if (!Array.isArray(candidateRoute) || candidateRoute.length < 2) {
      continue;
    }

    pairDetections.push({
      candidateRunId: candidate.id,
      events: detectChaseEncounters({ routeA: uploaderRoute, routeB: candidateRoute, arena }),
    });
  }

  // ---- 2) 쓰기 (idempotent) ----
  return mutateStore((mutableStore) => {
    const nowMs = Date.now();
    const nowIsoValue = new Date(nowMs).toISOString();
    const run = mutableStore.runs.find((entry) => entry.id === runId);

    if (!run?.chase) {
      return baseSummary;
    }

    ensureRunChase(run);
    const ledger = prunePairLedger(mutableStore, nowMs);
    const uploader = mutableStore.users.find((entry) => entry.id === run.userId);
    const newUploaderEvents = [];
    const touchedUserIds = new Set();

    for (const detection of pairDetections) {
      const key = pairKey(run.id, detection.candidateRunId);

      if (ledger[key]) {
        continue; // 다른 업로드가 먼저 정산한 쌍 (경쟁 조건 방어)
      }

      ledger[key] = nowIsoValue;
      const candidateRun = mutableStore.runs.find((entry) => entry.id === detection.candidateRunId);
      const candidateUser = candidateRun
        ? mutableStore.users.find((entry) => entry.id === candidateRun.userId)
        : null;

      if (!candidateRun || !candidateUser || !ensureRunChase(candidateRun)) {
        continue;
      }

      const existingPairTimes = collectExistingPairEventTimes(mutableStore, run.userId, candidateUser.id);
      let candidateCatchCount = 0;
      let candidateMeetCount = 0;
      let candidateCaughtCount = 0;
      let candidatePointsGained = 0;

      for (const event of detection.events) {
        const atMs = Date.parse(event.atIso);
        const withinCooldown = existingPairTimes.some(
          (existing) => Math.abs(atMs - existing) < CHASE_PAIR_COOLDOWN_MS,
        );

        if (withinCooldown) {
          continue;
        }

        existingPairTimes.push(atMs);

        // detectChaseEncounters의 A=업로더, B=상대 관점을 유저별 보상으로 변환.
        const uploaderBase =
          event.type === 'meet' ? CHASE_MEET_POINTS : event.catcher === 'A' ? CHASE_CATCH_POINTS : 0;
        const candidateBase =
          event.type === 'meet' ? CHASE_MEET_POINTS : event.catcher === 'B' ? CHASE_CATCH_POINTS : 0;
        const uploaderPoints = awardPoints({ store: mutableStore, run, user: { id: run.userId }, basePoints: uploaderBase });
        const candidatePoints = awardPoints({
          store: mutableStore,
          run: candidateRun,
          user: { id: candidateUser.id },
          basePoints: candidateBase,
        });
        const uploaderRole =
          event.type === 'meet' ? 'meet' : event.catcher === 'A' ? 'catcher' : 'caught';
        const candidateRole =
          event.type === 'meet' ? 'meet' : event.catcher === 'B' ? 'catcher' : 'caught';

        const uploaderEvent = {
          type: event.type,
          role: uploaderRole,
          otherUserId: candidateUser.id,
          otherName: candidateUser.name ?? '러너',
          atIso: event.atIso,
          points: uploaderPoints,
        };

        run.chase.bonusPoints += uploaderPoints;
        run.chase.events.push(uploaderEvent);
        newUploaderEvents.push(uploaderEvent);

        candidateRun.chase.bonusPoints += candidatePoints;
        candidateRun.chase.events.push({
          type: event.type,
          role: candidateRole,
          otherUserId: run.userId,
          otherName: uploader?.name ?? '러너',
          atIso: event.atIso,
          points: candidatePoints,
        });

        // 알림 집계 — 캡으로 0P가 됐어도 사건 자체는 세고, '잡힘'도 상대에게 알린다.
        candidateCatchCount += candidateRole === 'catcher' ? 1 : 0;
        candidateMeetCount += event.type === 'meet' ? 1 : 0;
        candidateCaughtCount += candidateRole === 'caught' ? 1 : 0;
        candidatePointsGained += candidatePoints;

        touchedUserIds.add(run.userId);
        touchedUserIds.add(candidateUser.id);
      }

      // 상대(먼저 끝난 러너)는 이 정산을 볼 화면이 없으니 인박스 알림으로 전달.
      if (candidateCatchCount > 0 || candidateMeetCount > 0 || candidateCaughtCount > 0) {
        appendUserNotification(mutableStore, {
          userId: candidateUser.id,
          type: 'chase_settlement',
          title: '경찰과 도둑런 정산',
          body: `${arena.name} · ${uploader?.name ?? '러너'}님과 ${describeAwards({
            catchCount: candidateCatchCount,
            meetCount: candidateMeetCount,
            caughtCount: candidateCaughtCount,
            points: candidatePointsGained,
          })}`,
          data: { arenaId: arena.id, runId: candidateRun.id },
          nowIso: () => nowIsoValue,
        });
      }
    }

    releaseChasePresenceForUser(mutableStore, run.userId, arena.id);

    for (const userId of touchedUserIds) {
      invalidateUserMetrics(mutableStore, userId);
    }

    return {
      arenaId: arena.id,
      arenaName: arena.name,
      newEvents: newUploaderEvents,
      totalBonusPoints: run.chase.bonusPoints,
    };
  });
}
