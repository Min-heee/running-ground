// 그라운드 (오너 2026-08-06): 친구와 기간을 정해 거리/시간 총합으로 겨루는 포인트 내기.
// 참가자 전원이 같은 포인트를 걸고(원장 방식 차감 — store.runmadangStakes), 기간이
// 끝나면 1등이 판돈을 모두 가져간다(store.runmadangAwards). 상태는 저장하지 않고
// startAt/endAt에서 읽기 시점에 도출한다 (matchSession의 hydrate 패턴).
//
// 포인트 회계: 밸런스는 어디에도 저장되지 않는다(points.mjs가 러닝에서 재계산).
// 차감은 getRedeemedPointCost(userStoreHelpers)가 stakes−awards 순지출을 합산하는
// 방식으로 반영된다 — 행은 절대 삭제하지 않고 status만 바꾼다(환불 = 'refunded').
// 정산은 settledAt 가드로 멱등 (chaseSettledPairs / lpApplied와 같은 계약).

import { nextId } from '../idHelpers.mjs';
import { ApiError } from '../../response/httpResponse.mjs';
import { appendUserNotification } from '../userNotifications.mjs';
import { areFriends } from '../socialStoreHelpers.mjs';
import { isCompetitiveRun } from '../competitiveRuns.mjs';
import { formatKstDateKey } from '../kstDate.mjs';
import {
  getRedeemedPointCost,
  getUserMetrics,
} from '../userStoreHelpers.mjs';
import { getAvailableRewardPoints } from '../points.mjs';

export const RUNMADANG_METRICS = new Set(['distance', 'duration']);
export const RUNMADANG_PERIOD_PRESETS = {
  '3d': 3 * 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
  '2w': 14 * 24 * 60 * 60 * 1000,
  '1m': 30 * 24 * 60 * 60 * 1000,
};
export const RUNMADANG_MAX_STAKE_POINTS = 10000;
export const RUNMADANG_MAX_INVITEES = 11; // 본인 포함 최대 12명 (파티방 초대 칩 캡과 동일)
// 직접 지정 최대 기간 — 오너 2026-08-07: 년 휠 최대 5년.
export const RUNMADANG_MAX_CUSTOM_SPAN_DAYS = 1827;
// 시작일 상한 — 상한이 없으면 수십 년 뒤 시작 판에 친구 판돈을 무기한 잠글 수 있다.
export const RUNMADANG_MAX_START_AHEAD_DAYS = 31;
// 호스트당 동시에 열어둘 수 있는 판 — 0P 판 무한 생성(초대 푸시 스팸·blob 비대)을 막는다.
export const RUNMADANG_MAX_OPEN_PER_HOST = 5;
// 정산/취소된 판은 30일 뒤 blob에서 정리한다. 스테이크/어워드 원장은 밸런스의
// 근거라서 영구 보존 — 판만 지운다.
export const RUNMADANG_SETTLED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function ensureRunmadangStore(store) {
  if (!Array.isArray(store.runmadangChallenges)) {
    store.runmadangChallenges = [];
  }
  if (!Array.isArray(store.runmadangStakes)) {
    store.runmadangStakes = [];
  }
  if (!Array.isArray(store.runmadangAwards)) {
    store.runmadangAwards = [];
  }
  return store.runmadangChallenges;
}

// 'upcoming' | 'running' | 'finished'(정산 대기) | 'settled' | 'cancelled'
export function resolveRunmadangStatus(challenge, now = new Date()) {
  if (challenge.cancelledAt) {
    return 'cancelled';
  }
  if (challenge.settledAt) {
    return 'settled';
  }
  const nowMs = now.getTime();
  if (nowMs < Date.parse(challenge.startAt)) {
    return 'upcoming';
  }
  if (nowMs < Date.parse(challenge.endAt)) {
    return 'running';
  }
  return 'finished';
}

function getAvailablePointsFor(store, userId) {
  return getAvailableRewardPoints(getUserMetrics(store, userId), getRedeemedPointCost(store, userId));
}

function pushStake(store, challenge, userId, nowIso) {
  // 0P 판은 회계 정보가 없는 행이라 원장에 남기지 않는다 (awards의 payout > 0 가드와 대칭).
  if (challenge.stakePoints <= 0) {
    return;
  }
  store.runmadangStakes.push({
    id: nextId('runmadang-stake'),
    challengeId: challenge.id,
    userId,
    points: challenge.stakePoints,
    status: 'staked',
    createdAt: nowIso,
  });
}

function refundStakeForUser(store, challenge, userId, nowIso) {
  for (const stake of store.runmadangStakes) {
    if (stake.challengeId === challenge.id && stake.userId === userId && stake.status === 'staked') {
      stake.status = 'refunded';
      stake.refundedAt = nowIso;
    }
  }
}

function refundStakes(store, challenge, nowIso) {
  for (const stake of store.runmadangStakes) {
    if (stake.challengeId === challenge.id && stake.status === 'staked') {
      stake.status = 'refunded';
      stake.refundedAt = nowIso;
    }
  }
}

function requireStakeBalance(store, userId, stakePoints) {
  if (stakePoints > 0 && getAvailablePointsFor(store, userId) < stakePoints) {
    throw new ApiError(400, '보유 포인트가 판돈보다 적어요.');
  }
}

const KST_DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseKstDayStartMs(dateKey) {
  return Date.parse(`${dateKey}T00:00:00+09:00`);
}

function resolvePeriod(input, now) {
  const preset = typeof input.periodPreset === 'string' ? input.periodPreset : null;

  if (preset) {
    const durationMs = RUNMADANG_PERIOD_PRESETS[preset];
    if (!durationMs) {
      throw new ApiError(400, '기간을 선택해주세요.');
    }
    return {
      startAt: now.toISOString(),
      endAt: new Date(now.getTime() + durationMs).toISOString(),
    };
  }

  const { startDate, endDate } = input;
  if (!KST_DATE_KEY_PATTERN.test(String(startDate ?? '')) || !KST_DATE_KEY_PATTERN.test(String(endDate ?? ''))) {
    throw new ApiError(400, '기간을 선택해주세요.');
  }

  const startMs = parseKstDayStartMs(startDate);
  const endMs = parseKstDayStartMs(endDate);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    throw new ApiError(400, '기간이 올바르지 않아요.');
  }

  // 직접 지정은 내일부터 — 오늘 이미 뛴 기록을 뒤늦게 판에 넣는 조작을 막는다.
  // (오늘부터 시작하고 싶으면 프리셋 = '지금부터'를 쓰면 된다.)
  if (String(startDate) <= formatKstDateKey(now)) {
    throw new ApiError(400, '직접 지정 기간은 내일부터 시작할 수 있어요.');
  }

  // 시작일 상한 — 먼 미래 판으로 참가자 판돈을 무기한 잠그는 것을 막는다 (피커 창과 정합).
  const maxStartKey = formatKstDateKey(
    new Date(now.getTime() + RUNMADANG_MAX_START_AHEAD_DAYS * 24 * 60 * 60 * 1000),
  );
  if (String(startDate) > maxStartKey) {
    throw new ApiError(400, `시작일은 ${RUNMADANG_MAX_START_AHEAD_DAYS}일 안에서 골라주세요.`);
  }

  const spanDays = Math.round((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1;
  if (spanDays > RUNMADANG_MAX_CUSTOM_SPAN_DAYS) {
    throw new ApiError(400, '기간은 최대 5년까지 가능해요.');
  }

  // 종료일 하루를 통째로 포함 — 다음날 00:00(KST)이 경계.
  return {
    startAt: new Date(startMs).toISOString(),
    endAt: new Date(endMs + 24 * 60 * 60 * 1000).toISOString(),
  };
}

const METRIC_LABELS = { distance: '거리', duration: '시간' };
export const RUNMADANG_MAX_TITLE_LENGTH = 20;

export function createRunmadangChallenge(store, user, input, now = new Date()) {
  ensureRunmadangStore(store);

  const metric = String(input.metric ?? '');
  if (!RUNMADANG_METRICS.has(metric)) {
    throw new ApiError(400, '대결 종목(거리/시간)을 선택해주세요.');
  }

  // 판 이름 (오너 2026-08-06: "이름부터 설정하게"). 필수 강제는 클라 쪽 —
  // 이름 없는 구버전 클라 요청은 종목 기본명으로 관대하게 받아 호환을 지킨다.
  const title = String(input.title ?? '')
    .trim()
    .slice(0, RUNMADANG_MAX_TITLE_LENGTH)
    || `${METRIC_LABELS[metric]} 대결`;

  const stakePoints = Number(input.stakePoints);
  if (!Number.isInteger(stakePoints) || stakePoints < 0 || stakePoints > RUNMADANG_MAX_STAKE_POINTS) {
    throw new ApiError(400, `판돈은 0~${RUNMADANG_MAX_STAKE_POINTS}P 사이 정수여야 해요.`);
  }

  const invitedFriendIds = Array.from(new Set(
    (Array.isArray(input.invitedFriendIds) ? input.invitedFriendIds : [])
      .filter((id) => typeof id === 'string' && id && id !== user.id),
  ));
  if (invitedFriendIds.length === 0) {
    throw new ApiError(400, '함께할 친구를 한 명 이상 초대해주세요.');
  }
  if (invitedFriendIds.length > RUNMADANG_MAX_INVITEES) {
    throw new ApiError(400, `친구는 최대 ${RUNMADANG_MAX_INVITEES}명까지 초대할 수 있어요.`);
  }
  for (const friendId of invitedFriendIds) {
    if (!areFriends(store, user.id, friendId)) {
      throw new ApiError(400, '친구 목록에 있는 러너만 초대할 수 있어요.');
    }
  }

  const openCount = store.runmadangChallenges
    .filter((entry) => entry.hostUserId === user.id && !entry.settledAt && !entry.cancelledAt)
    .length;
  if (openCount >= RUNMADANG_MAX_OPEN_PER_HOST) {
    throw new ApiError(400, `동시에 열 수 있는 그라운드는 ${RUNMADANG_MAX_OPEN_PER_HOST}개까지예요.`);
  }

  const period = resolvePeriod(input, now);
  requireStakeBalance(store, user.id, stakePoints);

  const nowIso = now.toISOString();
  const challenge = {
    id: nextId('runmadang'),
    hostUserId: user.id,
    title,
    metric,
    stakePoints,
    startAt: period.startAt,
    endAt: period.endAt,
    invitedFriendIds,
    participants: [{ userId: user.id, joinedAt: nowIso }],
    declinedUserIds: [],
    cancelledAt: null,
    settledAt: null,
    winnerUserIds: null,
    potPoints: null,
    resultTone: null,
    createdAt: nowIso,
  };

  store.runmadangChallenges.push(challenge);
  pushStake(store, challenge, user.id, nowIso);

  for (const friendId of invitedFriendIds) {
    appendUserNotification(store, {
      userId: friendId,
      type: 'runmadang_invite',
      title: '그라운드 초대',
      body: `${user.name}님이 "${title}" 그라운드에 초대했어요 · ${METRIC_LABELS[metric]} 대결${stakePoints > 0 ? ` · 판돈 ${stakePoints}P` : ''}`,
      data: { challengeId: challenge.id },
      nowIso: () => nowIso,
    });
  }

  return challenge;
}

function findChallengeOrThrow(store, challengeId) {
  ensureRunmadangStore(store);
  const challenge = store.runmadangChallenges.find((entry) => entry.id === challengeId);
  if (!challenge) {
    throw new ApiError(404, '그라운드를 찾을 수 없어요.');
  }
  return challenge;
}

export function joinRunmadangChallenge(store, user, challengeId, now = new Date()) {
  const challenge = findChallengeOrThrow(store, challengeId);
  const status = resolveRunmadangStatus(challenge, now);

  if (status === 'cancelled' || status === 'settled' || status === 'finished') {
    throw new ApiError(400, '이미 끝난 그라운드예요.');
  }
  if (challenge.participants.some((entry) => entry.userId === user.id)) {
    throw new ApiError(400, '이미 참가한 그라운드예요.');
  }
  if (!challenge.invitedFriendIds.includes(user.id)) {
    throw new ApiError(403, '초대받은 러너만 참가할 수 있어요.');
  }

  requireStakeBalance(store, user.id, challenge.stakePoints);

  const nowIso = now.toISOString();
  challenge.participants.push({ userId: user.id, joinedAt: nowIso });
  challenge.declinedUserIds = challenge.declinedUserIds.filter((id) => id !== user.id);
  pushStake(store, challenge, user.id, nowIso);

  appendUserNotification(store, {
    userId: challenge.hostUserId,
    type: 'runmadang_joined',
    title: '그라운드 참가',
    body: `${user.name}님이 그라운드에 참가했어요.`,
    data: { challengeId: challenge.id },
    nowIso: () => nowIso,
  });

  return challenge;
}

export function declineRunmadangChallenge(store, user, challengeId, now = new Date()) {
  const challenge = findChallengeOrThrow(store, challengeId);

  if (challenge.participants.some((entry) => entry.userId === user.id)) {
    throw new ApiError(400, '이미 참가한 그라운드는 거절할 수 없어요.');
  }
  // join과 같은 초대 가드 — 없으면 아무 유저나 남의 판에 자기 id를 기록할 수 있다.
  if (!challenge.invitedFriendIds.includes(user.id)) {
    throw new ApiError(403, '초대받은 러너만 거절할 수 있어요.');
  }
  if (!challenge.declinedUserIds.includes(user.id)) {
    challenge.declinedUserIds.push(user.id);
  }
  return challenge;
}

// 시작 전 참가 철회 — 호스트가 판을 방치해도 참가자가 스스로 판돈을 회수할 수 있어야
// 한다 (적대 리뷰: 참가자 셀프 회수 경로 부재). 다시 초대 목록에 남아 재참가 가능.
export function withdrawRunmadangChallenge(store, user, challengeId, now = new Date()) {
  const challenge = findChallengeOrThrow(store, challengeId);
  const status = resolveRunmadangStatus(challenge, now);

  if (challenge.hostUserId === user.id) {
    throw new ApiError(400, '만든 사람은 철회 대신 판 취소를 이용해주세요.');
  }
  if (!challenge.participants.some((entry) => entry.userId === user.id)) {
    throw new ApiError(400, '참가하지 않은 그라운드예요.');
  }
  if (status !== 'upcoming') {
    throw new ApiError(400, '시작 전에만 참가를 철회할 수 있어요.');
  }

  const nowIso = now.toISOString();
  challenge.participants = challenge.participants.filter((entry) => entry.userId !== user.id);
  refundStakeForUser(store, challenge, user.id, nowIso);

  appendUserNotification(store, {
    userId: challenge.hostUserId,
    type: 'runmadang_joined',
    title: '그라운드 참가 철회',
    body: `${user.name}님이 참가를 철회했어요. 판돈은 돌려드렸어요.`,
    data: { challengeId: challenge.id },
    nowIso: () => nowIso,
  });

  return challenge;
}

export function cancelRunmadangChallenge(store, user, challengeId, now = new Date()) {
  const challenge = findChallengeOrThrow(store, challengeId);
  const status = resolveRunmadangStatus(challenge, now);

  if (challenge.hostUserId !== user.id) {
    throw new ApiError(403, '만든 사람만 삭제할 수 있어요.');
  }
  // 진행 중에도 삭제 허용 (오너 2026-08-07: 상세 화면 맨 아래 삭제 버튼) — 전원
  // 환불이라 금전 손해는 없다. 다만 지고 있는 호스트가 판을 엎을 수 있는 건 사실이라
  // 참가자 전원에게 취소 알림이 간다. 기간이 끝난 판(finished/settled)은 정산이
  // 우선이므로 삭제 불가.
  if (status !== 'upcoming' && status !== 'running') {
    throw new ApiError(400, '이미 끝난 그라운드는 삭제할 수 없어요.');
  }

  const nowIso = now.toISOString();
  challenge.cancelledAt = nowIso;
  refundStakes(store, challenge, nowIso);

  for (const participant of challenge.participants) {
    if (participant.userId !== user.id) {
      appendUserNotification(store, {
        userId: participant.userId,
        type: 'runmadang_settled',
        title: '그라운드 삭제',
        body: `${user.name}님이 그라운드를 삭제했어요. 판돈은 돌려드렸어요.`,
        data: { challengeId: challenge.id },
        nowIso: () => nowIso,
      });
    }
  }

  return challenge;
}

// 끝난 판(정산/취소)을 내 목록에서만 숨긴다 — 데이터는 남고 다른 참가자 목록엔 그대로.
export function hideRunmadangChallenge(store, user, challengeId, now = new Date()) {
  const challenge = findChallengeOrThrow(store, challengeId);
  const status = resolveRunmadangStatus(challenge, now);

  if (status !== 'settled' && status !== 'cancelled') {
    throw new ApiError(400, '끝난 그라운드만 목록에서 삭제할 수 있어요.');
  }

  if (!Array.isArray(challenge.hiddenUserIds)) {
    challenge.hiddenUserIds = [];
  }
  if (!challenge.hiddenUserIds.includes(user.id)) {
    challenge.hiddenUserIds.push(user.id);
  }
  return challenge;
}

// 늦은 오프라인 업로드 유예 — 기간 안에 뛴 기록이 bg-sync 지연으로 종료 후에 저장돼도
// 이 시간 안이면 인정한다.
const RUN_UPLOAD_GRACE_MS = 48 * 60 * 60 * 1000;

// 집계 인정 조건 (적대 리뷰 2026-08-06):
// 1. 끝난 시각(endedAt, 옛 기록은 createdAt 폴백)이 [fromMs, endMs) 안 — fromMs는
//    참가자별 max(판 시작, 참가 시각). 참가 전 기록을 소급 인정하면 초대만 받아놓고
//    이기고 있을 때만 막판에 참가하는 무위험 옵션이 생긴다.
// 2. 서버가 찍은 저장 시각(createdAt)도 창(+늦은 업로드 유예) 안 — endedAt은
//    클라이언트 임의값이라, 창 밖에서 저장된 기록을 창 안 시각으로 위조해 넣는 것을
//    서버 시각으로 막는다. (창 안에서 과거 러닝을 복제 재저장하는 변종은 GPS 경로
//    지문 비교가 필요해 안티치트 3단계 백로그.)
// 임포트/수동 기록·차량 판정은 isCompetitiveRun이 걸러낸다.
function isRunCountable(run, fromMs, endMs) {
  const endedMs = Date.parse(run.endedAt ?? run.createdAt ?? '');
  if (!Number.isFinite(endedMs) || endedMs < fromMs || endedMs >= endMs) {
    return false;
  }

  const savedMs = Date.parse(run.createdAt ?? '');
  if (!Number.isFinite(savedMs)) {
    return true; // createdAt 없는 옛 기록 폴백
  }
  return savedMs >= fromMs && savedMs < endMs + RUN_UPLOAD_GRACE_MS;
}

function sumMetricValue(runs, metric) {
  if (metric === 'duration') {
    return Math.round(runs.reduce((sum, run) => sum + (Number(run.durationSeconds) || 0), 0));
  }
  return Number(runs.reduce((sum, run) => sum + (Number(run.distanceKm) || 0), 0).toFixed(2));
}

export function buildRunmadangStandings(store, challenge, now = new Date()) {
  const startMs = Date.parse(challenge.startAt);
  const endMs = Date.parse(challenge.endAt);
  const usersById = new Map(store.users.map((entry) => [entry.id, entry]));

  const rows = challenge.participants.map((participant) => {
    const joinedMs = Date.parse(participant.joinedAt ?? '');
    const fromMs = Number.isFinite(joinedMs) ? Math.max(startMs, joinedMs) : startMs;
    const runs = store.runs.filter((run) => run.userId === participant.userId
      && isCompetitiveRun(run)
      && isRunCountable(run, fromMs, endMs));

    return {
      userId: participant.userId,
      name: usersById.get(participant.userId)?.name ?? '알 수 없음',
      joinedAt: participant.joinedAt,
      value: sumMetricValue(runs, challenge.metric),
      runCount: runs.length,
    };
  });

  rows.sort((left, right) => right.value - left.value
    || String(left.joinedAt).localeCompare(String(right.joinedAt)));

  let rank = 0;
  let previousValue = null;
  rows.forEach((row, index) => {
    if (previousValue === null || row.value < previousValue) {
      rank = index + 1;
      previousValue = row.value;
    }
    row.rank = rank;
  });

  return rows;
}

export function settleRunmadangChallenge(store, challenge, now = new Date()) {
  if (challenge.settledAt || challenge.cancelledAt) {
    return false;
  }
  if (resolveRunmadangStatus(challenge, now) !== 'finished') {
    return false;
  }

  const nowIso = now.toISOString();
  const standings = buildRunmadangStandings(store, challenge, now);
  const topValue = standings[0]?.value ?? 0;

  // 무효 조건: 혼자 남았거나(내기 불성립) 아무도 안 뛰었으면 전원 환불.
  if (challenge.participants.length < 2 || topValue <= 0) {
    challenge.settledAt = nowIso;
    challenge.resultTone = 'void';
    challenge.winnerUserIds = [];
    challenge.potPoints = 0;
    refundStakes(store, challenge, nowIso);

    for (const participant of challenge.participants) {
      appendUserNotification(store, {
        userId: participant.userId,
        type: 'runmadang_settled',
        title: '그라운드 종료',
        body: challenge.participants.length < 2
          ? '참가자가 모이지 않아 그라운드가 무효 처리됐어요. 판돈이 돌아왔어요.'
          : '기간 동안 기록이 없어 무승부예요. 판돈이 돌아왔어요.',
        data: { challengeId: challenge.id },
        nowIso: () => nowIso,
      });
    }
    return true;
  }

  const winners = standings.filter((row) => row.value === topValue);
  const potPoints = challenge.stakePoints * challenge.participants.length;
  const basePayout = winners.length > 0 ? Math.floor(potPoints / winners.length) : 0;
  const remainder = potPoints - basePayout * winners.length;

  challenge.settledAt = nowIso;
  challenge.resultTone = 'win';
  challenge.winnerUserIds = winners.map((row) => row.userId);
  challenge.potPoints = potPoints;

  // 동률이면 균등 분배(나머지는 첫 참가 우승자) — 알림도 pot 전액이 아니라 개인
  // 수령액을 말해야 잔액과 화면이 맞는다 (적대 리뷰).
  const payoutByUserId = new Map();
  winners.forEach((winner, index) => {
    const payout = basePayout + (index === 0 ? remainder : 0);
    payoutByUserId.set(winner.userId, payout);
    if (payout > 0) {
      store.runmadangAwards.push({
        id: nextId('runmadang-award'),
        challengeId: challenge.id,
        userId: winner.userId,
        points: payout,
        createdAt: nowIso,
      });
    }
  });

  const winnerNames = winners.map((row) => row.name).join(', ');
  for (const participant of challenge.participants) {
    const payout = payoutByUserId.get(participant.userId);
    const winBody = winners.length > 1
      ? `공동 우승! ${payout}P를 가져왔어요 🏆`
      : `우승! 판돈 ${payout}P를 가져왔어요 🏆`;
    appendUserNotification(store, {
      userId: participant.userId,
      type: 'runmadang_settled',
      title: '그라운드 결과',
      body: typeof payout === 'number'
        ? winBody
        : `${winnerNames}님이 우승했어요. 다음 판에서 되찾아 봐요!`,
      data: { challengeId: challenge.id },
      nowIso: () => nowIso,
    });
  }

  return true;
}

export function hasDueRunmadangChallenges(store, now = new Date()) {
  return Array.isArray(store.runmadangChallenges)
    && store.runmadangChallenges.some((challenge) => resolveRunmadangStatus(challenge, now) === 'finished');
}

export function settleDueRunmadangChallenges(store, now = new Date()) {
  ensureRunmadangStore(store);
  let settled = 0;
  for (const challenge of store.runmadangChallenges) {
    if (settleRunmadangChallenge(store, challenge, now)) {
      settled += 1;
    }
  }
  return settled;
}

export function pruneRunmadangChallenges(store, now = new Date()) {
  ensureRunmadangStore(store);
  const nowMs = now.getTime();
  store.runmadangChallenges = store.runmadangChallenges.filter((challenge) => {
    const closedAt = challenge.settledAt ?? challenge.cancelledAt;
    if (!closedAt) {
      return true;
    }
    return nowMs - Date.parse(closedAt) < RUNMADANG_SETTLED_RETENTION_MS;
  });
}

function buildChallengePayload(store, challenge, currentUserId, now) {
  const status = resolveRunmadangStatus(challenge, now);
  const usersById = new Map(store.users.map((entry) => [entry.id, entry]));
  const isParticipant = challenge.participants.some((entry) => entry.userId === currentUserId);
  const isHost = challenge.hostUserId === currentUserId;

  let myRole = 'invited';
  if (isHost) {
    myRole = 'host';
  } else if (isParticipant) {
    myRole = 'participant';
  } else if (challenge.declinedUserIds.includes(currentUserId)) {
    myRole = 'declined';
  }

  // 미참가 초대자에게는 순위를 숨긴다 — 상대 값을 보고 이기고 있을 때만 참가하는
  // 무위험 옵션을 막는 정보 차단 (참가자별 집계 하한과 한 쌍).
  const standings = isParticipant
    ? buildRunmadangStandings(store, challenge, now).map((row) => ({
      userId: row.userId,
      name: row.name,
      rank: row.rank,
      value: row.value,
      runCount: row.runCount,
      isMe: row.userId === currentUserId,
    }))
    : [];

  const myPayoutPoints = challenge.settledAt
    ? store.runmadangAwards
      .filter((entry) => entry.challengeId === challenge.id && entry.userId === currentUserId)
      .reduce((sum, entry) => sum + (Number(entry.points) || 0), 0)
    : 0;

  return {
    id: challenge.id,
    // 이름 도입 전에 만들어진 판은 종목 기본명으로.
    title: challenge.title ?? `${METRIC_LABELS[challenge.metric]} 대결`,
    metric: challenge.metric,
    stakePoints: challenge.stakePoints,
    startAt: challenge.startAt,
    endAt: challenge.endAt,
    status,
    hostUserId: challenge.hostUserId,
    hostName: usersById.get(challenge.hostUserId)?.name ?? '알 수 없음',
    participantCount: challenge.participants.length,
    potPoints: challenge.potPoints ?? challenge.stakePoints * challenge.participants.length,
    myPayoutPoints,
    myRole,
    canJoin: myRole === 'invited' && (status === 'upcoming' || status === 'running'),
    canCancel: isHost && (status === 'upcoming' || status === 'running'),
    canWithdraw: isParticipant && !isHost && status === 'upcoming',
    canHide: status === 'settled' || status === 'cancelled',
    standings,
    winnerUserIds: challenge.winnerUserIds,
    resultTone: challenge.resultTone,
    settledAt: challenge.settledAt,
    createdAt: challenge.createdAt,
  };
}

export function buildRunmadangMinePayload(store, user, now = new Date()) {
  ensureRunmadangStore(store);

  const mine = store.runmadangChallenges
    .filter((challenge) => challenge.hostUserId === user.id
      || challenge.participants.some((entry) => entry.userId === user.id)
      || challenge.invitedFriendIds.includes(user.id))
    .filter((challenge) => !challenge.cancelledAt || challenge.participants.some((entry) => entry.userId === user.id))
    // 내 목록에서 삭제(숨김)한 판은 제외.
    .filter((challenge) => !(Array.isArray(challenge.hiddenUserIds) && challenge.hiddenUserIds.includes(user.id)))
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
    .map((challenge) => buildChallengePayload(store, challenge, user.id, now));

  return {
    challenges: mine,
    availablePoints: getAvailablePointsFor(store, user.id),
  };
}
