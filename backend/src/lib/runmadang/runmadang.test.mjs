import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRunmadangMinePayload,
  buildRunmadangStandings,
  cancelRunmadangChallenge,
  createRunmadangChallenge,
  declineRunmadangChallenge,
  joinRunmadangChallenge,
  pruneRunmadangChallenges,
  resolveRunmadangStatus,
  settleDueRunmadangChallenges,
  withdrawRunmadangChallenge,
} from './runmadang.mjs';
import { getRedeemedPointCost } from '../userStoreHelpers.mjs';

const NOW = new Date('2026-08-06T03:00:00.000Z'); // KST 12:00

function buildRun({ userId, km, durationSeconds = 1800, endedAt, sourceType = 'runningground', verdict }) {
  return {
    id: `run-${userId}-${endedAt}`,
    userId,
    date: endedAt.slice(0, 10),
    distanceKm: km,
    durationSeconds,
    startedAt: endedAt,
    endedAt,
    sourceType,
    ...(verdict ? { integrity: { verdict } } : {}),
  };
}

function buildStore({ runs = [] } = {}) {
  return {
    users: [
      { id: 'user-a', name: '가람' },
      { id: 'user-b', name: '나래' },
      { id: 'user-c', name: '다온' },
    ],
    friendships: [
      { userIds: ['user-a', 'user-b'] },
      { userIds: ['user-a', 'user-c'] },
    ],
    runs,
    notifications: [],
  };
}

function createBasicChallenge(store, { stakePoints = 0, metric = 'distance', invited = ['user-b'] } = {}) {
  return createRunmadangChallenge(
    store,
    store.users[0],
    { metric, stakePoints, periodPreset: '1w', invitedFriendIds: invited },
    NOW,
  );
}

test('그라운드 생성: 방장 자동 참가 + 초대 알림 (0P 판은 원장 행 없음)', () => {
  const store = buildStore();
  const challenge = createBasicChallenge(store, { invited: ['user-b', 'user-c'] });

  assert.equal(resolveRunmadangStatus(challenge, NOW), 'running');
  assert.deepEqual(challenge.participants.map((entry) => entry.userId), ['user-a']);
  // 0P 스테이크는 회계 정보가 없어 원장에 남기지 않는다.
  assert.equal(store.runmadangStakes.length, 0);
  const invites = store.notifications.filter((entry) => entry.type === 'runmadang_invite');
  assert.deepEqual(invites.map((entry) => entry.userId).sort(), ['user-b', 'user-c']);
  assert.equal(invites[0].data.challengeId, challenge.id);
});

test('그라운드 생성 검증: 친구 아닌 초대·판돈 잔액 부족은 거부', () => {
  const store = buildStore();

  // user-b와 user-c는 서로 친구가 아니다.
  assert.throws(
    () => createRunmadangChallenge(store, store.users[1], {
      metric: 'distance', stakePoints: 0, periodPreset: '1w', invitedFriendIds: ['user-c'],
    }, NOW),
    /친구 목록/,
  );

  // 포인트 0인 유저가 판돈 100을 걸 수 없다.
  assert.throws(
    () => createBasicChallenge(store, { stakePoints: 100 }),
    /보유 포인트가 판돈보다 적어요/,
  );
});

test('직접 지정 기간: 오늘 시작은 거부, 내일부터 허용, 31일 초과 거부', () => {
  const store = buildStore();

  assert.throws(
    () => createRunmadangChallenge(store, store.users[0], {
      metric: 'distance', stakePoints: 0, startDate: '2026-08-06', endDate: '2026-08-10', invitedFriendIds: ['user-b'],
    }, NOW),
    /내일부터/,
  );

  assert.throws(
    () => createRunmadangChallenge(store, store.users[0], {
      metric: 'distance', stakePoints: 0, startDate: '2026-08-07', endDate: '2026-09-30', invitedFriendIds: ['user-b'],
    }, NOW),
    /최대 31일/,
  );

  const challenge = createRunmadangChallenge(store, store.users[0], {
    metric: 'distance', stakePoints: 0, startDate: '2026-08-07', endDate: '2026-08-13', invitedFriendIds: ['user-b'],
  }, NOW);
  assert.equal(resolveRunmadangStatus(challenge, NOW), 'upcoming');
  // KST 8/7 00:00 = UTC 8/6 15:00, 종료 경계는 8/13 하루를 포함한 8/14 00:00 KST.
  assert.equal(challenge.startAt, '2026-08-06T15:00:00.000Z');
  assert.equal(challenge.endAt, '2026-08-13T15:00:00.000Z');
});

test('참가: 초대받은 사람만, 참가 알림, 거절 취소', () => {
  const store = buildStore();
  const challenge = createBasicChallenge(store);

  assert.throws(
    () => joinRunmadangChallenge(store, store.users[2], challenge.id, NOW),
    /초대받은 러너만/,
  );

  declineRunmadangChallenge(store, store.users[1], challenge.id, NOW);
  assert.deepEqual(challenge.declinedUserIds, ['user-b']);

  joinRunmadangChallenge(store, store.users[1], challenge.id, NOW);
  assert.deepEqual(challenge.participants.map((entry) => entry.userId), ['user-a', 'user-b']);
  assert.deepEqual(challenge.declinedUserIds, []);
  assert.equal(store.notifications.filter((entry) => entry.type === 'runmadang_joined').length, 1);

  assert.throws(
    () => joinRunmadangChallenge(store, store.users[1], challenge.id, NOW),
    /이미 참가한/,
  );
});

test('취소: 시작 전 방장만, 스테이크 전액 환불', () => {
  // 10km 러닝 두 개 → 각자 10P 확보 → 판돈 10P.
  const earnRunA = buildRun({ userId: 'user-a', km: 10, endedAt: '2026-08-01T10:00:00.000Z' });
  const earnRunB = buildRun({ userId: 'user-b', km: 10, endedAt: '2026-08-01T10:00:00.000Z' });
  const store = buildStore({ runs: [earnRunA, earnRunB] });

  const challenge = createRunmadangChallenge(store, store.users[0], {
    metric: 'distance', stakePoints: 10, startDate: '2026-08-07', endDate: '2026-08-13', invitedFriendIds: ['user-b'],
  }, NOW);
  joinRunmadangChallenge(store, store.users[1], challenge.id, NOW);

  assert.equal(getRedeemedPointCost(store, 'user-a'), 10);
  assert.equal(getRedeemedPointCost(store, 'user-b'), 10);

  assert.throws(
    () => cancelRunmadangChallenge(store, store.users[1], challenge.id, NOW),
    /만든 사람만/,
  );

  cancelRunmadangChallenge(store, store.users[0], challenge.id, NOW);
  assert.equal(resolveRunmadangStatus(challenge, NOW), 'cancelled');
  assert.equal(getRedeemedPointCost(store, 'user-a'), 0);
  assert.equal(getRedeemedPointCost(store, 'user-b'), 0);
});

test('집계: 기간 안 인앱 러닝만 — 임포트·차량 판정·기간 밖 기록 제외', () => {
  const store = buildStore();
  const challenge = createBasicChallenge(store);
  joinRunmadangChallenge(store, store.users[1], challenge.id, NOW);

  const inWindow = '2026-08-08T10:00:00.000Z';
  store.runs.push(
    buildRun({ userId: 'user-a', km: 5, endedAt: inWindow }),
    buildRun({ userId: 'user-a', km: 3, endedAt: '2026-08-01T10:00:00.000Z' }), // 기간 전
    buildRun({ userId: 'user-b', km: 4, endedAt: inWindow }),
    buildRun({ userId: 'user-b', km: 9, endedAt: inWindow, sourceType: 'strava' }), // 임포트
    buildRun({ userId: 'user-b', km: 20, endedAt: inWindow, verdict: 'vehicle' }), // 차량
  );

  const standings = buildRunmadangStandings(store, challenge, NOW);
  assert.deepEqual(
    standings.map((row) => [row.userId, row.value, row.rank]),
    [['user-a', 5, 1], ['user-b', 4, 2]],
  );
});

test('정산(거리): 우승자가 판돈 전부 획득 + 결과 알림 + 멱등', () => {
  const earnA = buildRun({ userId: 'user-a', km: 10, endedAt: '2026-08-01T10:00:00.000Z' });
  const earnB = buildRun({ userId: 'user-b', km: 10, endedAt: '2026-08-01T10:00:00.000Z' });
  const store = buildStore({ runs: [earnA, earnB] });

  const challenge = createBasicChallenge(store, { stakePoints: 10 });
  joinRunmadangChallenge(store, store.users[1], challenge.id, NOW);

  store.runs.push(
    buildRun({ userId: 'user-a', km: 6, endedAt: '2026-08-08T10:00:00.000Z' }),
    buildRun({ userId: 'user-b', km: 4, endedAt: '2026-08-08T11:00:00.000Z' }),
  );

  const afterEnd = new Date('2026-08-14T00:00:00.000Z');
  assert.equal(settleDueRunmadangChallenges(store, afterEnd), 1);
  assert.equal(challenge.resultTone, 'win');
  assert.deepEqual(challenge.winnerUserIds, ['user-a']);
  assert.equal(challenge.potPoints, 20);

  // 우승자 순지출 = 스테이크 10 − 상금 20 = −10 (밸런스 +10 순증).
  assert.equal(getRedeemedPointCost(store, 'user-a'), -10);
  assert.equal(getRedeemedPointCost(store, 'user-b'), 10);

  const results = store.notifications.filter((entry) => entry.type === 'runmadang_settled');
  assert.equal(results.length, 2);
  assert.match(results.find((entry) => entry.userId === 'user-a').body, /우승/);

  // 멱등: 다시 정산해도 아무 일도 없다.
  assert.equal(settleDueRunmadangChallenges(store, afterEnd), 0);
  assert.equal(store.runmadangAwards.length, 1);
});

test('정산(시간): durationSeconds 합산으로 승부', () => {
  const store = buildStore();
  const challenge = createBasicChallenge(store, { metric: 'duration' });
  joinRunmadangChallenge(store, store.users[1], challenge.id, NOW);

  store.runs.push(
    buildRun({ userId: 'user-a', km: 3, durationSeconds: 1200, endedAt: '2026-08-08T10:00:00.000Z' }),
    buildRun({ userId: 'user-b', km: 2, durationSeconds: 3600, endedAt: '2026-08-08T11:00:00.000Z' }),
  );

  settleDueRunmadangChallenges(store, new Date('2026-08-14T00:00:00.000Z'));
  assert.deepEqual(challenge.winnerUserIds, ['user-b']);
});

test('정산 무효: 혼자 남았거나 아무도 안 뛰면 전액 환불', () => {
  const earnA = buildRun({ userId: 'user-a', km: 10, endedAt: '2026-08-01T10:00:00.000Z' });
  const store = buildStore({ runs: [earnA] });

  // 아무도 참가 안 함 → 무효 + 환불.
  const solo = createBasicChallenge(store, { stakePoints: 10 });
  settleDueRunmadangChallenges(store, new Date('2026-08-14T00:00:00.000Z'));
  assert.equal(solo.resultTone, 'void');
  assert.equal(getRedeemedPointCost(store, 'user-a'), 0);
});

test('정산 동률: 판돈 균등 분배(나머지는 먼저 참가한 쪽)', () => {
  const earnA = buildRun({ userId: 'user-a', km: 10, endedAt: '2026-08-01T10:00:00.000Z' });
  const earnB = buildRun({ userId: 'user-b', km: 10, endedAt: '2026-08-01T10:00:00.000Z' });
  const earnC = buildRun({ userId: 'user-c', km: 10, endedAt: '2026-08-01T10:00:00.000Z' });
  const store = buildStore({ runs: [earnA, earnB, earnC] });
  store.friendships.push({ userIds: ['user-b', 'user-c'] });

  const challenge = createBasicChallenge(store, { stakePoints: 5, invited: ['user-b', 'user-c'] });
  joinRunmadangChallenge(store, store.users[1], challenge.id, NOW);
  joinRunmadangChallenge(store, store.users[2], challenge.id, NOW);

  store.runs.push(
    buildRun({ userId: 'user-a', km: 5, endedAt: '2026-08-08T10:00:00.000Z' }),
    buildRun({ userId: 'user-b', km: 5, endedAt: '2026-08-08T11:00:00.000Z' }),
    buildRun({ userId: 'user-c', km: 1, endedAt: '2026-08-08T12:00:00.000Z' }),
  );

  settleDueRunmadangChallenges(store, new Date('2026-08-14T00:00:00.000Z'));
  // 판돈 15를 둘이 나누면 7+나머지1 / 7.
  const awards = store.runmadangAwards.map((entry) => [entry.userId, entry.points]);
  assert.equal(awards.reduce((sum, [, points]) => sum + points, 0), 15);
  assert.equal(challenge.winnerUserIds.length, 2);
});

test('prune: 30일 지난 정산 판만 제거, 원장은 보존', () => {
  const earnA = buildRun({ userId: 'user-a', km: 10, endedAt: '2026-08-01T10:00:00.000Z' });
  const store = buildStore({ runs: [earnA] });
  const challenge = createBasicChallenge(store, { stakePoints: 10 });
  challenge.settledAt = '2026-06-01T00:00:00.000Z';

  pruneRunmadangChallenges(store, NOW);
  assert.equal(store.runmadangChallenges.length, 0);
  assert.equal(store.runmadangStakes.length, 1);
});

test('내 목록: 역할·참가 가능 여부·순위 포함', () => {
  const store = buildStore();
  const challenge = createBasicChallenge(store);

  const hostView = buildRunmadangMinePayload(store, store.users[0], NOW);
  assert.equal(hostView.challenges.length, 1);
  assert.equal(hostView.challenges[0].myRole, 'host');
  assert.equal(hostView.challenges[0].canJoin, false);
  assert.equal(typeof hostView.availablePoints, 'number');

  const inviteeView = buildRunmadangMinePayload(store, store.users[1], NOW);
  assert.equal(inviteeView.challenges[0].myRole, 'invited');
  assert.equal(inviteeView.challenges[0].canJoin, true);

  const strangerView = buildRunmadangMinePayload(store, store.users[2], NOW);
  assert.equal(strangerView.challenges.length, 0);
  assert.equal(challenge.id, hostView.challenges[0].id);
});

// --- 적대 리뷰 수정 회귀 (2026-08-06) ---

test('무위험 후참 차단: 참가 이전 기록은 집계에서 제외', () => {
  const store = buildStore();
  const challenge = createBasicChallenge(store);

  // 기간 안이지만 user-b가 참가하기 전의 기록.
  store.runs.push(buildRun({ userId: 'user-b', km: 9, endedAt: '2026-08-07T10:00:00.000Z' }));
  const joinAt = new Date('2026-08-09T00:00:00.000Z');
  joinRunmadangChallenge(store, store.users[1], challenge.id, joinAt);
  // 참가 이후 기록.
  store.runs.push(buildRun({ userId: 'user-b', km: 2, endedAt: '2026-08-10T10:00:00.000Z' }));
  store.runs.push(buildRun({ userId: 'user-a', km: 1, endedAt: '2026-08-10T11:00:00.000Z' }));

  const standings = buildRunmadangStandings(store, challenge, joinAt);
  const rowB = standings.find((row) => row.userId === 'user-b');
  assert.equal(rowB.value, 2); // 참가 전 9km는 무시
});

test('무위험 후참 차단: 미참가 초대자에게는 순위를 숨긴다', () => {
  const store = buildStore();
  const challenge = createBasicChallenge(store);
  store.runs.push(buildRun({ userId: 'user-a', km: 5, endedAt: '2026-08-07T10:00:00.000Z' }));

  const inviteeView = buildRunmadangMinePayload(store, store.users[1], NOW);
  assert.equal(inviteeView.challenges[0].myRole, 'invited');
  assert.deepEqual(inviteeView.challenges[0].standings, []);

  const hostView = buildRunmadangMinePayload(store, store.users[0], NOW);
  assert.equal(hostView.challenges[0].standings.length, 1);
  assert.equal(challenge.id, hostView.challenges[0].id);
});

test('타임스탬프 위조 차단: 창 밖에서 저장된 기록은 endedAt이 창 안이어도 제외', () => {
  const store = buildStore();
  const challenge = createBasicChallenge(store);

  // endedAt은 창 안으로 위조했지만 서버 저장 시각(createdAt)이 창 시작 전.
  const forged = buildRun({ userId: 'user-a', km: 10, endedAt: '2026-08-08T10:00:00.000Z' });
  forged.createdAt = '2026-08-01T10:00:00.000Z';
  store.runs.push(forged);
  // 정상: 창 안 저장 + 창 안 종료.
  const legit = buildRun({ userId: 'user-a', km: 3, endedAt: '2026-08-09T10:00:00.000Z' });
  legit.createdAt = '2026-08-09T10:05:00.000Z';
  store.runs.push(legit);
  // 늦은 오프라인 업로드: 창 안에 뛰었고 종료 후 하루 뒤 저장 — 유예로 인정.
  const late = buildRun({ userId: 'user-a', km: 1, endedAt: '2026-08-12T10:00:00.000Z' });
  late.createdAt = '2026-08-14T09:00:00.000Z';
  store.runs.push(late);

  const standings = buildRunmadangStandings(store, challenge, NOW);
  assert.equal(standings[0].value, 4); // 3 + 1, 위조 10km 제외
});

test('직접 지정 시작일 상한: 31일 초과 미래 시작 거부', () => {
  const store = buildStore();
  assert.throws(
    () => createRunmadangChallenge(store, store.users[0], {
      metric: 'distance', stakePoints: 0, startDate: '2026-09-08', endDate: '2026-09-10', invitedFriendIds: ['user-b'],
    }, NOW),
    /31일 안에서/,
  );
});

test('호스트당 열린 판 상한: 5개 초과 생성 거부', () => {
  const store = buildStore();
  for (let index = 0; index < 5; index += 1) {
    createBasicChallenge(store);
  }
  assert.throws(() => createBasicChallenge(store), /5개까지/);
});

test('거절도 초대받은 사람만: 비초대 유저는 403', () => {
  const store = buildStore();
  const challenge = createBasicChallenge(store); // user-b만 초대
  assert.throws(
    () => declineRunmadangChallenge(store, store.users[2], challenge.id, NOW),
    /초대받은 러너만/,
  );
  assert.deepEqual(challenge.declinedUserIds, []);
});

test('참가 철회: 시작 전 참가자 환불 + 재참가 가능, 호스트·시작 후는 거부', () => {
  const earnA = buildRun({ userId: 'user-a', km: 10, endedAt: '2026-08-01T10:00:00.000Z' });
  const earnB = buildRun({ userId: 'user-b', km: 10, endedAt: '2026-08-01T10:00:00.000Z' });
  const store = buildStore({ runs: [earnA, earnB] });

  const challenge = createRunmadangChallenge(store, store.users[0], {
    metric: 'distance', stakePoints: 10, startDate: '2026-08-10', endDate: '2026-08-16', invitedFriendIds: ['user-b'],
  }, NOW);
  joinRunmadangChallenge(store, store.users[1], challenge.id, NOW);
  assert.equal(getRedeemedPointCost(store, 'user-b'), 10);

  assert.throws(
    () => withdrawRunmadangChallenge(store, store.users[0], challenge.id, NOW),
    /판 취소를 이용/,
  );

  withdrawRunmadangChallenge(store, store.users[1], challenge.id, NOW);
  assert.deepEqual(challenge.participants.map((entry) => entry.userId), ['user-a']);
  assert.equal(getRedeemedPointCost(store, 'user-b'), 0);
  // 여전히 초대 목록에 있어 재참가 가능.
  joinRunmadangChallenge(store, store.users[1], challenge.id, NOW);
  assert.equal(getRedeemedPointCost(store, 'user-b'), 10);

  // 시작 후에는 철회 불가.
  const afterStart = new Date('2026-08-11T00:00:00.000Z');
  assert.throws(
    () => withdrawRunmadangChallenge(store, store.users[1], challenge.id, afterStart),
    /시작 전에만/,
  );
});

test('동률 정산 알림: 개인 수령액 표기 + myPayoutPoints 페이로드', () => {
  const earnA = buildRun({ userId: 'user-a', km: 10, endedAt: '2026-08-01T10:00:00.000Z' });
  const earnB = buildRun({ userId: 'user-b', km: 10, endedAt: '2026-08-01T10:00:00.000Z' });
  const earnC = buildRun({ userId: 'user-c', km: 10, endedAt: '2026-08-01T10:00:00.000Z' });
  const store = buildStore({ runs: [earnA, earnB, earnC] });
  store.friendships.push({ userIds: ['user-b', 'user-c'] });

  const challenge = createBasicChallenge(store, { stakePoints: 5, invited: ['user-b', 'user-c'] });
  joinRunmadangChallenge(store, store.users[1], challenge.id, NOW);
  joinRunmadangChallenge(store, store.users[2], challenge.id, NOW);

  store.runs.push(
    buildRun({ userId: 'user-a', km: 5, endedAt: '2026-08-08T10:00:00.000Z' }),
    buildRun({ userId: 'user-b', km: 5, endedAt: '2026-08-08T11:00:00.000Z' }),
    buildRun({ userId: 'user-c', km: 1, endedAt: '2026-08-08T12:00:00.000Z' }),
  );

  const afterEnd = new Date('2026-08-14T00:00:00.000Z');
  settleDueRunmadangChallenges(store, afterEnd);

  const winnerNotes = store.notifications
    .filter((entry) => entry.type === 'runmadang_settled' && /공동 우승/.test(entry.body));
  assert.equal(winnerNotes.length, 2);
  // pot 15 → 8(먼저 참가) / 7 — 알림이 개인 수령액을 말한다.
  const bodies = winnerNotes.map((entry) => entry.body).sort();
  assert.ok(bodies.some((body) => body.includes('8P')));
  assert.ok(bodies.some((body) => body.includes('7P')));

  const viewA = buildRunmadangMinePayload(store, store.users[0], afterEnd);
  assert.equal(viewA.challenges[0].myPayoutPoints, 8);
  const viewC = buildRunmadangMinePayload(store, store.users[2], afterEnd);
  assert.equal(viewC.challenges[0].myPayoutPoints, 0);
});

test('판 이름: 저장·페이로드·초대 알림에 반영, 없으면 종목 기본명', () => {
  const store = buildStore();
  const named = createRunmadangChallenge(store, store.users[0], {
    metric: 'distance', stakePoints: 0, periodPreset: '1w', invitedFriendIds: ['user-b'],
    title: '  이번 주 10km 내기  ',
  }, NOW);
  assert.equal(named.title, '이번 주 10km 내기');
  const invite = store.notifications.find((entry) => entry.type === 'runmadang_invite');
  assert.ok(invite.body.includes('"이번 주 10km 내기"'));

  const view = buildRunmadangMinePayload(store, store.users[0], NOW);
  assert.equal(view.challenges[0].title, '이번 주 10km 내기');

  // 이름 없이(구버전 클라) 오면 종목 기본명. 20자 초과는 잘린다.
  const unnamed = createRunmadangChallenge(store, store.users[0], {
    metric: 'duration', stakePoints: 0, periodPreset: '3d', invitedFriendIds: ['user-b'],
  }, NOW);
  assert.equal(unnamed.title, '시간 대결');
  const long = createRunmadangChallenge(store, store.users[0], {
    metric: 'distance', stakePoints: 0, periodPreset: '3d', invitedFriendIds: ['user-b'],
    title: '가나다라마바사아자차카타파하가나다라마바사',
  }, NOW);
  assert.equal(long.title.length, 20);
});
