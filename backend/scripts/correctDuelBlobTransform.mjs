// Pure blob transform for the 2026-07-04 retroactive duel correction script
// (scripts/correct-duel-2026-07-04.mjs). Kept import-free so the unit test
// (scripts/correct-duel-2026-07-04.test.mjs) can load it without touching the
// store/config bootstrap.
//
// The corrected shape mirrors resolveDuelMatchResultFromSavedRuns in
// src/lib/matchResultBuilders.mjs (the no-session save resolver): authoritative
// title/badgeLabel copy per outcome, resultTone, opponent identity, and both
// measured durations — so 기록상세/대결결과(/result reconstruction)/전적 all read
// the same verdict the resolver itself would have produced.

// Twin of the (unexported) buildAuthoritativeDuelCopy in matchResultBuilders.mjs —
// keep the copy byte-identical to the server resolver's win/lose strings.
function buildAuthoritativeDuelCopy(outcome, opponentName) {
  const name = typeof opponentName === 'string' && opponentName.trim() ? opponentName.trim() : '상대';

  if (outcome === 'win') {
    return { title: `${name}님을 이겼어요`, badgeLabel: '승리' };
  }

  return { title: `${name}님에게 졌어요`, badgeLabel: '패배' };
}

// Build the corrected duel matchResult blob for ONE side of the match.
// outcome is derived from the measured durations (faster wins) and must agree
// with them — a mismatch throws instead of writing a self-contradicting blob.
export function buildCorrectedDuelMatchResult({
  matchResult,
  outcome,
  myDurationSeconds,
  opponentDurationSeconds,
  opponentId,
  opponentName,
  opponentPaceLabel,
}) {
  if (!matchResult || matchResult.mode !== 'duel') {
    throw new Error('duel matchResult 블랍이 아니야.');
  }

  if (outcome !== 'win' && outcome !== 'lose') {
    throw new Error(`지원하지 않는 outcome: ${outcome}`);
  }

  if (!Number.isInteger(myDurationSeconds) || myDurationSeconds <= 0
    || !Number.isInteger(opponentDurationSeconds) || opponentDurationSeconds <= 0) {
    throw new Error('완주 시간은 1초 이상의 정수여야 해.');
  }

  const measuredOutcome = myDurationSeconds < opponentDurationSeconds ? 'win' : 'lose';

  if (myDurationSeconds === opponentDurationSeconds || measuredOutcome !== outcome) {
    throw new Error(
      `outcome(${outcome})이 측정 기록(내 ${myDurationSeconds}s vs 상대 ${opponentDurationSeconds}s)과 맞지 않아.`,
    );
  }

  const copy = buildAuthoritativeDuelCopy(outcome, opponentName);
  const gapSeconds = Math.abs(opponentDurationSeconds - myDurationSeconds);

  const corrected = {
    ...matchResult,
    title: copy.title,
    badgeLabel: copy.badgeLabel,
    // The pending blob carries the "상대가 완주하면 결과가 자동으로 업데이트돼요." summary and a
    // win-shaped blob carries a gap-based one — both are stale after the correction, so the
    // summary is rebuilt in the same '앞서/뒤에서 마무리했어요' idiom the live result card uses.
    summary: outcome === 'win'
      ? `상대보다 ${gapSeconds}초 앞서 마무리했어요.`
      : `상대보다 ${gapSeconds}초 뒤에서 마무리했어요.`,
    resultTone: outcome,
    opponentName: typeof opponentName === 'string' && opponentName.trim() ? opponentName.trim() : '상대',
    opponentId,
    myDurationSeconds,
    opponentDurationSeconds,
  };

  // A stale live-arena gapKm (distance gap at the moment the screen froze) is meaningless
  // for the corrected verdict — the resolver's pending path drops it too.
  delete corrected.gapKm;

  // Carry the opponent's own saved pace label when available, else drop any stale guess —
  // same rule as resolveDuelMatchResultFromSavedRuns.
  if (typeof opponentPaceLabel === 'string' && opponentPaceLabel) {
    corrected.opponentPaceLabel = opponentPaceLabel;
  } else {
    delete corrected.opponentPaceLabel;
  }

  return corrected;
}

// Idempotency check: the blob already carries the exact corrected verdict → the script
// must not touch it again (double-apply guard for the blob half).
export function isDuelCorrectionAlreadyApplied(matchResult, {
  outcome,
  myDurationSeconds,
  opponentDurationSeconds,
  opponentId,
}) {
  return Boolean(matchResult)
    && matchResult.mode === 'duel'
    && matchResult.resultTone === outcome
    && matchResult.myDurationSeconds === myDurationSeconds
    && matchResult.opponentDurationSeconds === opponentDurationSeconds
    && (!opponentId || matchResult.opponentId === opponentId);
}
