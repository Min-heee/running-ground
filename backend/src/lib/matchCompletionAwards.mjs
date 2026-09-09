import { isParticipantDoneWithMatch } from './matchPureHelpers.mjs';
import { isTestMatchSession } from './matchScheduleHelpers.mjs';
import {
  applyLpDelta,
  resolveDuelMatchLpDeltas,
  resolveGroupMatchLpDelta,
} from './rankSystem.mjs';
import { ensureUserRankState, findUserById } from './userStoreHelpers.mjs';
import {
  buildMatchRunnerProfile,
  buildOfficialSessionStandings,
} from './runningMatchSessionStoreHelpers.mjs';
import { appendUserNotification } from './userNotifications.mjs';
// Imported straight from the submodule (not the facade) because ONLY the seal-revision hook
// needs these; the facade re-export surface stays untouched for existing importers.
import { registerSealFinalizationLpApplier } from './runningMatchSession/matchSessionFallbackSeals.mjs';

// The LP + result-notification CORE, callable from two places with the same idempotency
// guarantees (the one-way lpApplied/resultNotificationApplied booleans):
//   1. applyMatchLpIfComplete — the every-done wrapper on the normal finish/forfeit path.
//   2. The sweep's seal-FINALIZATION phase (via registerSealFinalizationLpApplier below) —
//      where the sealed-DNF side is 'disconnected', so the every-done gate can never pass.
// Winner is standings rank 1: under a finalized seal that is the sole finisher; after a
// revision it is measured-elapsed truth. The DNF side takes the loser LP delta.
function applyMatchLpFromStandings(store, session, standings, participants) {
  if (!session || (session.lpApplied && session.resultNotificationApplied)) {
    return;
  }

  try {
    const officialByUserId = new Map(standings.map((standing) => [standing.userId, standing]));
    appendMatchResultNotifications(store, session, participants, officialByUserId);

    if (session.lpApplied) {
      return;
    }

    // Test matches never award rank LP. The guard also marks lpApplied BEFORE any
    // rank math runs, because the group LP path below looks up participants as store
    // users — a test-match bot (profileSnapshot participant) resolves to undefined and
    // throws mid-loop, which used to leave lpApplied unset and re-award the real
    // user's LP on every retry poll. Party runs keep their existing exclusion.
    if (session.isPartyRun || session.skipRankLp || isTestMatchSession(session)) {
      session.lpApplied = true;
      return;
    }

    let updates;

    if (session.mode === 'duel' && participants.length === 2) {
      const winnerStanding = standings.find((standing) => standing.officialRank === 1);
      const loserStanding = standings.find((standing) => standing.officialRank === 2);

      if (!winnerStanding || !loserStanding) {
        return;
      }

      const winner = findUserById(store, winnerStanding.userId);
      const loser = findUserById(store, loserStanding.userId);
      const winnerPaceSecPerKm = buildMatchRunnerProfile(store, winner).averagePaceMinutes * 60;
      const loserPaceSecPerKm = buildMatchRunnerProfile(store, loser).averagePaceMinutes * 60;
      const { winnerLpDelta, loserLpDelta } = resolveDuelMatchLpDeltas({
        winnerPaceSecPerKm,
        loserPaceSecPerKm,
      });

      updates = [
        { user: winner, deltaLp: winnerLpDelta },
        { user: loser, deltaLp: loserLpDelta },
      ];
    } else {
      updates = participants.map((participant) => {
        const user = findUserById(store, participant.userId);
        const placement = officialByUserId.get(participant.userId)?.officialRank;
        return {
          user,
          deltaLp: resolveGroupMatchLpDelta({
            placement,
            totalParticipants: participants.length,
          }),
        };
      });
    }

    for (const { user, deltaLp } of updates) {
      const previousRankState = { ...ensureUserRankState(user) };
      const nextRankState = applyLpDelta(previousRankState, deltaLp);
      user.rankState = {
        tier: nextRankState.tier,
        lp: nextRankState.lp,
      };
      appendRankChangeNotification(store, session, user, deltaLp, previousRankState, user.rankState);
    }
    session.lpApplied = true;
  } catch {
    // Rank updates must never block match completion responses.
  }
}

export function applyMatchLpIfComplete(store, session) {
  if (!session || (session.lpApplied && session.resultNotificationApplied)) {
    return;
  }

  const participants = Array.isArray(session.participants) ? session.participants : [];
  const now = new Date();
  if (!participants.length || !participants.every((participant) => isParticipantDoneWithMatch(participant, now))) {
    if (session.isPartyRun || session.skipRankLp || isTestMatchSession(session)) {
      session.lpApplied = true;
    }
    return;
  }

  let standings;
  try {
    standings = buildOfficialSessionStandings(store, session, now);
  } catch {
    // Rank updates must never block match completion responses.
    return;
  }

  applyMatchLpFromStandings(store, session, standings, participants);
}

// 기권/실격 스탬프 + 완료 훅의 단일 지점 (적대 리뷰 2026-09-09). 두 호출자가 같은 필드를 같은
// 순서로 박아야 해서 여기 한 곳에 둔다:
//   1. leaveRunningMatch — 클라이언트의 이탈 호출(기권; reason 'disqualified'면 실격패).
//   2. 저장 시 resolver(matchResultBuilders) — 이탈 호출이 서버에 못 닿았는데(네트워크/400,
//      클라가 삼킴) '실격패'/'기권 패' 블롭은 도착한 경우. 세션 참가자가 아직 달리는 중으로
//      남아 있으면 그 블롭이 PENDING으로 뒤집히고 상대는 평문 '승리'로 굳어 실격 표식이 양쪽
//      화면에서 사라졌다 — 그래서 저장이 leave가 했을 스탬프를 대신 박는다.
// reason 'disqualified'는 disqualified/forfeitReason을 추가로 박는다(판정·LP·정렬은 기권 그대로 =
// 실격패는 패배). 이 스탬프로 세션이 완료되면 LP·결과 알림(applyMatchLpIfComplete)까지 여기서
// 돈다. 물리적 prune(pruneMatchSessions/Rooms)은 호출자 몫이다 — leave는 즉시 정리하고, resolver는
// 곧바로 그 세션의 standings를 읽어야 하므로 정리하지 않는다(다음 상태 폴/진행 푸시가 한다).
// 반환값은 박힌 forfeitedAt ISO 문자열.
export function forfeitSessionParticipant(store, session, participant, { reason, now = new Date() } = {}) {
  const forfeitedAt = now.toISOString();
  participant.liveStatus = 'forfeited';
  participant.liveUpdatedAt = forfeitedAt;
  participant.forfeitedAt = forfeitedAt;

  if (reason === 'disqualified') {
    participant.disqualified = true;
    participant.forfeitReason = 'disqualified';
  }

  applyMatchLpIfComplete(store, session);
  return forfeitedAt;
}

// Register the LP/notification core into the sweep's seal-FINALIZATION phase at module init —
// the same injection pattern registerFinisherSavedRunBackfill uses (the session-store modules
// must not import this handler module, or the load order would cycle). The finalizer applies
// LP off the live standings (rank 1 = the finalized seal's sole finisher) with the identical
// one-way boolean guards, so a finalize→forfeit→retry sequence can never double-apply.
registerSealFinalizationLpApplier((store, session, now = new Date()) => {
  const participants = Array.isArray(session?.participants) ? session.participants : [];
  if (!participants.length) {
    return;
  }

  let standings;
  try {
    standings = buildOfficialSessionStandings(store, session, now);
  } catch {
    // Finalization LP must never block the sweep.
    return;
  }

  applyMatchLpFromStandings(store, session, standings, participants);
});

function getMatchModeLabel(mode) {
  return mode === 'duel' ? '1대1 대결' : '그룹 대결';
}

function appendMatchResultNotifications(store, session, participants, officialByUserId) {
  if (session.resultNotificationApplied) {
    return;
  }

  const modeLabel = getMatchModeLabel(session.mode);

  for (const participant of participants) {
    const standing = officialByUserId.get(participant.userId);
    const rankText = Number.isFinite(standing?.officialRank)
      ? ` ${standing.officialRank}위`
      : '';

    appendUserNotification(store, {
      userId: participant.userId,
      type: 'match_result',
      title: `${modeLabel} 결과`,
      body: `${modeLabel}${rankText} 결과가 확정됐어요.`,
      data: {
        matchId: session.id,
        mode: session.mode,
        ...(Number.isFinite(standing?.officialRank) ? { rank: standing.officialRank } : {}),
        participantCount: participants.length,
      },
    });
  }

  session.resultNotificationApplied = true;
}

function appendRankChangeNotification(store, session, user, deltaLp, previousRankState, nextRankState) {
  const safeDeltaLp = Math.trunc(Number(deltaLp) || 0);

  if (
    safeDeltaLp === 0
    || (
      previousRankState.tier === nextRankState.tier
      && previousRankState.lp === nextRankState.lp
    )
  ) {
    return;
  }

  appendUserNotification(store, {
    userId: user.id,
    type: 'rank_change',
    title: '랭크 LP 변동',
    body: `대결 결과로 랭크 ${safeDeltaLp > 0 ? '+' : ''}${safeDeltaLp} LP가 반영됐어요.`,
    data: {
      matchId: session.id,
      mode: session.mode,
      tier: nextRankState.tier,
      lp: nextRankState.lp,
      lpDelta: safeDeltaLp,
    },
  });
}
