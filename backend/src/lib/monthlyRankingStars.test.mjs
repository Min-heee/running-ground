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

function buildStore() {
  return {
    users: [
      { id: 'u-a', name: '가', provinceName: '경기도', cityName: '고양시', districtName: '일산서구' },
      { id: 'u-b', name: '나', provinceName: '경기도', cityName: '고양시', districtName: '일산동구' },
      { id: 'u-c', name: '다', provinceName: '서울특별시', cityName: '', districtName: '강남구' },
      { id: 'u-none', name: '라', provinceName: '', cityName: '', districtName: '' }, // 지역 미설정 — 제외
    ],
    runs: [
      // 7월: 고양시 u-a 30km, u-b 20km / 강남구 u-c 40km
      { id: 'r1', userId: 'u-a', date: '2026-07-05', distanceKm: 12 },
      { id: 'r2', userId: 'u-a', date: '2026-07-20', distanceKm: 18 },
      { id: 'r3', userId: 'u-b', date: '2026-07-10', distanceKm: 20 },
      { id: 'r4', userId: 'u-c', date: '2026-07-15', distanceKm: 40 },
      // 8월: 아직 진행 중 — 절대 봉인되면 안 됨
      { id: 'r5', userId: 'u-b', date: '2026-08-02', distanceKm: 50 },
    ],
  };
}

test('지난달 봉인: 지역 우승(인당 평균 기준) + 지역별 개인 우승, 진행 중인 달은 제외', () => {
  const store = buildStore();
  // 2026-08-13 KST — 7월만 봉인 대상.
  const created = sweepMonthlyRankingStars(store, new Date('2026-08-13T03:00:00.000Z'));

  assert.equal(created.length, 1);
  const july = created[0];
  assert.equal(july.monthKey, '2026-07');

  // 지역 우승: 강남구 인당 40 vs 고양시 인당 25 — 강남구.
  assert.deepEqual(july.regionChampions.map((champion) => champion.regionKey), ['서울특별시|강남구']);

  // 개인 우승: 고양시 u-a(30), 강남구 u-c(40).
  assert.deepEqual(
    july.memberChampions.map((champion) => [champion.regionKey, champion.userId, champion.distanceKm]).sort(),
    [['경기도|고양시', 'u-a', 30], ['서울특별시|강남구', 'u-c', 40]],
  );

  // 별 개수 파생.
  const counts = buildRankingStarCounts(store);
  assert.equal(counts.regionStars.get('서울특별시|강남구'), 1);
  assert.equal(counts.memberStars.get('u-a'), 1);
  assert.equal(counts.memberStars.get('u-b'), undefined);
});

test('멱등: 두 번째 스윕은 아무것도 봉인하지 않는다', () => {
  const store = buildStore();
  const at = new Date('2026-08-13T03:00:00.000Z');
  sweepMonthlyRankingStars(store, at);
  assert.equal(sweepMonthlyRankingStars(store, at).length, 0);
  assert.equal(store.monthlyRankingAwards.length, 1);
  assert.equal(hasUnsealedRankingStarMonth(store, at), false);
});

test('KST 달 경계 + 48시간 봉인 유예: 8월 3일 0시 KST부터 7월이 봉인된다', () => {
  assert.equal(resolveKstMonthKey(new Date('2026-07-31T15:30:00.000Z')), '2026-08');
  assert.equal(resolveKstMonthKey(new Date('2026-07-31T14:59:00.000Z')), '2026-07');

  // 8월 2일 23:59 KST — 유예(48h) 안이라 아직 봉인 금지 (대기열 늦은 업로드 구제 창).
  const early = buildStore();
  assert.equal(sweepMonthlyRankingStars(early, new Date('2026-08-02T14:59:00.000Z')).length, 0);

  // 8월 3일 0시 30분 KST — 유예 종료, 봉인.
  const after = buildStore();
  assert.equal(sweepMonthlyRankingStars(after, new Date('2026-08-02T15:30:00.000Z')).length, 1);
});

test('동률은 공동 우승, 거리 0뿐인 달은 우승 없음', () => {
  const store = buildStore();
  store.runs = [
    { id: 'r1', userId: 'u-a', date: '2026-07-05', distanceKm: 20 },
    { id: 'r2', userId: 'u-b', date: '2026-07-06', distanceKm: 20 },
  ];
  const [july] = sweepMonthlyRankingStars(store, new Date('2026-08-05T03:00:00.000Z'));
  // 고양시 공동 개인 우승 2명, 강남구는 0km라 개인 우승 없음.
  assert.deepEqual(july.memberChampions.map((champion) => champion.userId).sort(), ['u-a', 'u-b']);
  assert.equal(july.memberChampions.every((champion) => champion.regionKey === '경기도|고양시'), true);
  // 지역 우승도 고양시 단독 (강남구 총거리 0).
  assert.deepEqual(july.regionChampions.map((champion) => champion.regionKey), ['경기도|고양시']);

  const empty = buildStore();
  empty.runs = [];
  const [emptyJuly] = sweepMonthlyRankingStars(empty, new Date('2026-08-05T03:00:00.000Z'));
  assert.deepEqual(emptyJuly.regionChampions, []);
  assert.deepEqual(emptyJuly.memberChampions, []);
});

test('resolveRegionNodeStarKey: 시/군 리프와 광역시 구 리프만 키를 갖는다', () => {
  assert.equal(
    resolveRegionNodeStarKey({ level: 'city', name: '고양시' }, { provinceName: '경기도', cityName: '' }),
    '경기도|고양시',
  );
  assert.equal(
    resolveRegionNodeStarKey({ level: 'district', name: '강남구' }, { provinceName: '서울특별시', cityName: '' }),
    '서울특별시|강남구',
  );
  // 시 아래 구(도시 롤업에 흡수)와 상위 레벨은 별 대상 아님.
  assert.equal(
    resolveRegionNodeStarKey({ level: 'district', name: '일산서구' }, { provinceName: '경기도', cityName: '고양시' }),
    null,
  );
  assert.equal(resolveRegionNodeStarKey({ level: 'province', name: '경기도' }, { provinceName: '', cityName: '' }), null);
});

// 적대 검증 2026-08-13: 과거 달을 현재 상태로 재구성할 때의 시간 오염 3종 차단.
test('그 달이 끝난 뒤 가입한 유저는 그 달 명부(분모)에서 제외된다', () => {
  const store = buildStore();
  // 8월 가입자 셋이 고양시에 합류 — 7월 인당 평균을 희석해 우승을 뒤집던 구멍.
  for (let index = 0; index < 3; index += 1) {
    store.users.push({
      id: `u-aug-${index}`, name: `팔월${index}`,
      provinceName: '경기도', cityName: '고양시', districtName: '일산서구',
      createdAt: '2026-08-05T00:00:00.000Z',
    });
  }
  const [july] = sweepMonthlyRankingStars(store, new Date('2026-08-13T03:00:00.000Z'));
  // 고양시 7월 평균은 여전히 2명 기준(25km) — 강남구(40km)가 우승 유지, 희석 없음.
  assert.deepEqual(july.regionChampions.map((champion) => champion.regionKey), ['서울특별시|강남구']);
  const goyang = july.memberChampions.filter((champion) => champion.regionKey === '경기도|고양시');
  assert.deepEqual(goyang.map((champion) => champion.userId), ['u-a']);
});

test('유예 후 생성된 과거 날짜 기록(늦은 임포트)은 제외, 유예 안 생성(대기열)은 포함', () => {
  const store = buildStore();
  // 8월 10일에 생성된 7월 날짜 기록(헬스 임포트) — u-b가 7월 우승을 훔치려는 모양.
  store.runs.push({ id: 'r-late-import', userId: 'u-b', date: '2026-07-25', distanceKm: 99, createdAt: '2026-08-10T00:00:00.000Z' });
  // 8월 1일 아침 대기열 드레인(말일 러닝 늦은 업로드) — u-a의 정당한 7월 기록.
  store.runs.push({ id: 'r-queue-drain', userId: 'u-a', date: '2026-07-31', distanceKm: 5, createdAt: '2026-08-01T01:00:00.000Z' });

  const [july] = sweepMonthlyRankingStars(store, new Date('2026-08-13T03:00:00.000Z'));
  const goyang = july.memberChampions.filter((champion) => champion.regionKey === '경기도|고양시');
  // u-a 30+5=35 vs u-b 20(+99 제외) — u-a 우승 유지.
  assert.deepEqual(goyang.map((champion) => [champion.userId, champion.distanceKm]), [['u-a', 35]]);
});
