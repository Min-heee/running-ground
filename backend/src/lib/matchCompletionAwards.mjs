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
