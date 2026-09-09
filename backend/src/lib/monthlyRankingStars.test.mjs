import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRankingStarCounts,
  hasUnsealedRankingStarMonth,
  resolveKstMonthKey,
  resolveRegionNodeStarKey,
  sweepMonthlyRankingStars,
} from './monthlyRankingStars.mjs';

// 월간 랭킹 별: 시계 전부 주입(KST 경계 포함), 원장 봉인 멱등, 화면 공식과 동일한 우승 판정.
// 기산 달 = 2026-08 (오너 2026-09-05) — 픽스처는 8월 러닝을 9월에 봉인하는 흐름.

function buildStore() {
  return {
    users: [
      { id: 'u-a', name: '가', provinceName: '경기도', cityName: '고양시', districtName: '일산서구' },
      { id: 'u-b', name: '나', provinceName: '경기도', cityName: '고양시', districtName: '일산동구' },
      { id: 'u-c', name: '다', provinceName: '서울특별시', cityName: '', districtName: '강남구' },
      { id: 'u-none', name: '라', provinceName: '', cityName: '', districtName: '' }, // 지역 미설정 — 제외
    ],
    runs: [
      // 8월: 고양시 u-a 30km, u-b 20km / 강남구 u-c 40km
      { id: 'r1', userId: 'u-a', date: '2026-08-05', distanceKm: 12 },
      { id: 'r2', userId: 'u-a', date: '2026-08-20', distanceKm: 18 },
      { id: 'r3', userId: 'u-b', date: '2026-08-10', distanceKm: 20 },
      { id: 'r4', userId: 'u-c', date: '2026-08-15', distanceKm: 40 },
      // 9월: 아직 진행 중 — 절대 봉인되면 안 됨
      { id: 'r5', userId: 'u-b', date: '2026-09-02', distanceKm: 50 },
    ],
  };
}

test('지난달 봉인 (규칙 v2): 시·도 1등 + 시·도별 리프 1등 + 지역별 개인 우승', () => {
  const store = buildStore();
  // 2026-09-13 KST — 8월만 봉인 대상.
  const created = sweepMonthlyRankingStars(store, new Date('2026-09-13T03:00:00.000Z'));

  assert.equal(created.length, 1);
  const august = created[0];
  assert.equal(august.monthKey, '2026-08');
  assert.equal(august.ruleVersion, 2);

  // 시·도 1등: 서울 인당 40(강남구 u-c 40, 1명) vs 경기 인당 25(50/2) — 서울특별시.
  assert.deepEqual(august.provinceChampions.map((champion) => champion.regionKey), ['서울특별시']);

  // 시·도별 리프 1등: 시·도마다 하나씩 — 경기도→고양시, 서울→강남구.
  assert.deepEqual(
    august.regionChampions.map((champion) => champion.regionKey).sort(),
    ['경기도|고양시', '서울특별시|강남구'],
  );

  // 개인 우승: 고양시 u-a(30), 강남구 u-c(40).
  assert.deepEqual(
    august.memberChampions.map((champion) => [champion.regionKey, champion.userId, champion.distanceKm]).sort(),
    [['경기도|고양시', 'u-a', 30], ['서울특별시|강남구', 'u-c', 40]],
  );

  // 별 개수 파생 — 시·도 키(단독)와 리프 키(시도|이름)가 나란히.
  const counts = buildRankingStarCounts(store);
  assert.equal(counts.regionStars.get('서울특별시'), 1);
  assert.equal(counts.regionStars.get('서울특별시|강남구'), 1);
  assert.equal(counts.regionStars.get('경기도|고양시'), 1);
  assert.equal(counts.regionStars.get('경기도'), undefined);
  assert.equal(counts.memberStars.get('u-a'), 1);
  assert.equal(counts.memberStars.get('u-b'), undefined);
});

test('멱등: 두 번째 스윕은 아무것도 봉인하지 않는다', () => {
  const store = buildStore();
  const at = new Date('2026-09-13T03:00:00.000Z');
  sweepMonthlyRankingStars(store, at);
  assert.equal(sweepMonthlyRankingStars(store, at).length, 0);
  assert.equal(store.monthlyRankingAwards.length, 1);
  assert.equal(hasUnsealedRankingStarMonth(store, at), false);
});

test('KST 달 경계 + 48시간 봉인 유예: 9월 3일 0시 KST부터 8월이 봉인된다', () => {
  assert.equal(resolveKstMonthKey(new Date('2026-07-31T15:30:00.000Z')), '2026-08');
  assert.equal(resolveKstMonthKey(new Date('2026-07-31T14:59:00.000Z')), '2026-07');

  // 9월 2일 23:59 KST — 유예(48h) 안이라 아직 봉인 금지 (대기열 늦은 업로드 구제 창).
  const early = buildStore();
  assert.equal(sweepMonthlyRankingStars(early, new Date('2026-09-02T14:59:00.000Z')).length, 0);

  // 9월 3일 0시 30분 KST — 유예 종료, 봉인.
  const after = buildStore();
  assert.equal(sweepMonthlyRankingStars(after, new Date('2026-09-02T15:30:00.000Z')).length, 1);
});

test('동률은 공동 우승, 0km 지역·시·도는 회원수가 많아도 우승 없음 (오너 규칙 ③)', () => {
  const store = buildStore();
  store.runs = [
    { id: 'r1', userId: 'u-a', date: '2026-08-05', distanceKm: 20 },
    { id: 'r2', userId: 'u-b', date: '2026-08-06', distanceKm: 20 },
  ];
  const [august] = sweepMonthlyRankingStars(store, new Date('2026-09-05T03:00:00.000Z'));
  // 고양시 공동 개인 우승 2명, 강남구는 0km라 개인 우승 없음.
  assert.deepEqual(august.memberChampions.map((champion) => champion.userId).sort(), ['u-a', 'u-b']);
  assert.equal(august.memberChampions.every((champion) => champion.regionKey === '경기도|고양시'), true);
  // 시·도별 리프 1등: 경기도→고양시만 — 서울은 유일 리프(강남구)가 0km라 별 없음.
  assert.deepEqual(august.regionChampions.map((champion) => champion.regionKey), ['경기도|고양시']);
  // 시·도 1등: 경기도(인당 20) — 서울은 0km라 후보 아님.
  assert.deepEqual(august.provinceChampions.map((champion) => champion.regionKey), ['경기도']);

  // 회원수가 아무리 많아도 전부 0km면 시·도/지역 별 없음.
  const empty = buildStore();
  empty.runs = [];
  const [emptyAugust] = sweepMonthlyRankingStars(empty, new Date('2026-09-05T03:00:00.000Z'));
  assert.deepEqual(emptyAugust.provinceChampions, []);
  assert.deepEqual(emptyAugust.regionChampions, []);
  assert.deepEqual(emptyAugust.memberChampions, []);
});

test('resolveRegionNodeStarKey: 시·도(단독 키)·시/군 리프·광역시 구 리프가 키를 갖는다', () => {
  assert.equal(
    resolveRegionNodeStarKey({ level: 'city', name: '고양시' }, { provinceName: '경기도', cityName: '' }),
    '경기도|고양시',
  );
  assert.equal(
    resolveRegionNodeStarKey({ level: 'district', name: '강남구' }, { provinceName: '서울특별시', cityName: '' }),
    '서울특별시|강남구',
  );
  // 시·도 노드 (규칙 v2-①) — 키는 시·도명 단독.
  assert.equal(
    resolveRegionNodeStarKey({ level: 'province', name: '경기도' }, { provinceName: '', cityName: '' }),
    '경기도',
  );
  // 시 아래 구(도시 롤업에 흡수)와 루트는 별 대상 아님.
  assert.equal(
    resolveRegionNodeStarKey({ level: 'district', name: '일산서구' }, { provinceName: '경기도', cityName: '고양시' }),
    null,
  );
  assert.equal(resolveRegionNodeStarKey({ level: 'country', name: '대한민국' }, { provinceName: '', cityName: '' }), null);
});

// 적대 검증 2026-08-13: 과거 달을 현재 상태로 재구성할 때의 시간 오염 3종 차단.
test('그 달이 끝난 뒤 가입한 유저는 그 달 명부(분모)에서 제외된다', () => {
  const store = buildStore();
  // 9월 가입자 셋이 서울(강남구)에 합류 — 희석이 있었다면 서울 시·도 인당 평균이
  // 40 → 10으로 떨어져 시·도 1등이 경기도로 뒤집힌다.
  for (let index = 0; index < 3; index += 1) {
    store.users.push({
      id: `u-sep-${index}`, name: `구월${index}`,
      provinceName: '서울특별시', cityName: '', districtName: '강남구',
      createdAt: '2026-09-05T00:00:00.000Z',
    });
  }
  const [august] = sweepMonthlyRankingStars(store, new Date('2026-09-13T03:00:00.000Z'));
  // 서울 8월 인당 평균은 여전히 1명 기준(40km) — 시·도 1등 유지, 희석 없음.
  assert.deepEqual(august.provinceChampions.map((champion) => champion.regionKey), ['서울특별시']);
  assert.equal(august.provinceChampions[0].memberCount, 1);
  const goyang = august.memberChampions.filter((champion) => champion.regionKey === '경기도|고양시');
  assert.deepEqual(goyang.map((champion) => champion.userId), ['u-a']);
});

test('유예 후 생성된 과거 날짜 기록(늦은 임포트)은 제외, 유예 안 생성(대기열)은 포함', () => {
  const store = buildStore();
  // 9월 10일에 생성된 8월 날짜 기록(헬스 임포트) — u-b가 8월 우승을 훔치려는 모양.
  store.runs.push({ id: 'r-late-import', userId: 'u-b', date: '2026-08-25', distanceKm: 99, createdAt: '2026-09-10T00:00:00.000Z' });
  // 9월 1일 아침 대기열 드레인(말일 러닝 늦은 업로드) — u-a의 정당한 8월 기록.
  store.runs.push({ id: 'r-queue-drain', userId: 'u-a', date: '2026-08-31', distanceKm: 5, createdAt: '2026-09-01T01:00:00.000Z' });

  const [august] = sweepMonthlyRankingStars(store, new Date('2026-09-13T03:00:00.000Z'));
  const goyang = august.memberChampions.filter((champion) => champion.regionKey === '경기도|고양시');
  // u-a 30+5=35 vs u-b 20(+99 제외) — u-a 우승 유지.
  assert.deepEqual(goyang.map((champion) => [champion.userId, champion.distanceKm]), [['u-a', 35]]);
});

// 오너 2026-09-05: 별 기산을 8월로 올림 — 그 전 달(7월) 봉인 원장은 스윕이 삭제한다.
test('기산 달 이전의 봉인 원장은 스윕이 삭제하고, 파생 별 개수에서도 사라진다', () => {
  const store = buildStore();
  const at = new Date('2026-09-13T03:00:00.000Z');
  sweepMonthlyRankingStars(store, at); // 8월 봉인.

  // 옛 7월 원장(기산 전) 주입 — 실제 프로덕션에 남아 있는 상태 재현.
  store.monthlyRankingAwards.unshift({
    monthKey: '2026-07',
    sealedAt: '2026-08-03T00:00:00.000Z',
    regionChampions: [{ regionKey: '서울특별시|강남구', regionName: '강남구' }],
    memberChampions: [{ regionKey: '서울특별시|강남구', regionName: '강남구', userId: 'u-c', userName: '다', distanceKm: 77 }],
  });

  // 옛 원장이 있으면 스윕 트리거가 켜져야 한다 (mutate 경로를 타야 지워지니까).
  assert.equal(hasUnsealedRankingStarMonth(store, at), true);

  assert.equal(sweepMonthlyRankingStars(store, at).length, 0); // 새 봉인은 없음.
  assert.deepEqual(store.monthlyRankingAwards.map((award) => award.monthKey), ['2026-08']);
  assert.equal(hasUnsealedRankingStarMonth(store, at), false);

  // 파생 별 개수에서도 7월 별은 사라진다 (u-c는 8월 우승 1개만).
  const counts = buildRankingStarCounts(store);
  assert.equal(counts.memberStars.get('u-c'), 1);
});

// 오너 2026-09-05 규칙 v2: 옛 규칙(v1)으로 봉인된 달은 스윕이 같은 달을 재봉인해 승격한다.
test('v1 봉인 원장은 스윕이 새 규칙으로 재봉인한다 (sealedAt 보존, 중복 없음)', () => {
  const store = buildStore();
  const at = new Date('2026-09-13T03:00:00.000Z');
  // 프로덕션에 남아 있는 v1 8월 봉인 재현 — ruleVersion 없음, 전국 단일 지역 우승 형태.
  // 개인 별에 재계산이면 사라질 항목(u-gone: 이미 탈퇴한 유저)을 심어 이식 불변성을 핀.
  store.monthlyRankingAwards = [{
    monthKey: '2026-08',
    sealedAt: '2026-09-03T00:10:00.000Z',
    regionChampions: [{ regionKey: '서울특별시|강남구', regionName: '강남구' }],
    memberChampions: [
      { regionKey: '서울특별시|강남구', regionName: '강남구', userId: 'u-c', userName: '다', distanceKm: 40 },
      { regionKey: '제주특별자치도|제주시', regionName: '제주시', userId: 'u-gone', userName: '탈퇴자', distanceKm: 12 },
    ],
  }];

  assert.equal(hasUnsealedRankingStarMonth(store, at), true);
  assert.equal(sweepMonthlyRankingStars(store, at).length, 0); // 새 달 봉인은 없음 — 재작성만.

  assert.equal(store.monthlyRankingAwards.length, 1);
  const upgraded = store.monthlyRankingAwards[0];
  assert.equal(upgraded.monthKey, '2026-08');
  assert.equal(upgraded.ruleVersion, 2);
  assert.equal(upgraded.sealedAt, '2026-09-03T00:10:00.000Z');
  assert.deepEqual(upgraded.provinceChampions.map((champion) => champion.regionKey), ['서울특별시']);
  assert.deepEqual(
    upgraded.regionChampions.map((champion) => champion.regionKey).sort(),
    ['경기도|고양시', '서울특별시|강남구'],
  );
  // 개인 별은 봉인본 그대로 이식 — 봉인 후 탈퇴/지역 이동이 이미 준 별을 못 건드린다.
  assert.deepEqual(
    upgraded.memberChampions.map((champion) => champion.userId).sort(),
    ['u-c', 'u-gone'],
  );
  assert.equal(hasUnsealedRankingStarMonth(store, at), false);
});

test('차량 판정 기록은 봉인 원장에서 빠진다 — 화면 monthDistanceByKey와 동일 (오너 2026-09-09)', () => {
  const store = buildStore();
  // u-b(고양시)에 8월 차량 판정 100km: 세면 u-b가 고양시 개인 1위, 경기도(인당 75)가 시·도 1위로 뒤집힌다.
  store.runs.push({
    id: 'r-car',
    userId: 'u-b',
    date: '2026-08-12',
    distanceKm: 100,
    integrity: { verdict: 'vehicle', reason: 'cadence-audit', checkedAt: '2026-08-12T10:00:00.000Z' },
  });
  // suspect(텔레메트리 전용)는 여전히 센다 — 고양시 합계 50 → 55.
  store.runs.push({
    id: 'r-suspect',
    userId: 'u-b',
    date: '2026-08-13',
    distanceKm: 5,
    integrity: { verdict: 'suspect', checkedAt: '2026-08-13T10:00:00.000Z' },
  });

  const [august] = sweepMonthlyRankingStars(store, new Date('2026-09-13T03:00:00.000Z'));

  assert.deepEqual(august.provinceChampions.map((champion) => champion.regionKey), ['서울특별시']);
  assert.deepEqual(
    august.memberChampions.map((champion) => [champion.regionKey, champion.userId, champion.distanceKm]).sort(),
    [['경기도|고양시', 'u-a', 30], ['서울특별시|강남구', 'u-c', 40]],
  );
  const goyang = august.regionChampions.find((champion) => champion.regionKey === '경기도|고양시');
  assert.equal(goyang.totalDistanceKm, 55);
});
