import assert from 'node:assert/strict';
import test from 'node:test';

import type { CrewMemberRow, CrewSeasonInfo, CrewStandingRow } from '@/lib/api/types/crew';
import { ApiError } from '@/services/apiError';
import {
  buildCrewCancelRequestConfirmMessage,
  buildCrewCreateConfirmMessage,
  buildCrewGapLine,
  buildCrewHeroMeta,
  buildCrewHeroSeasonNote,
  buildCrewInviteShareMessage,
  buildCrewJoinConfirmMessage,
  buildCrewKickConfirmMessage,
  buildCrewLastSeasonHeadline,
  buildCrewLeaveConfirmMessage,
  buildCrewPreseasonNote,
  buildCrewScoreExampleLine,
  buildCrewScoreFormulaLine,
  buildCrewScoreRuleLines,
  buildCrewSearchMeta,
  buildCrewSeasonStatusLine,
  checkCrewName,
  computeCrewScore,
  describeCrewInviteCodeInput,
  describeCrewSearchResults,
  describeCrewUnranked,
  formatCrewKm,
  formatCrewMemberJoinTag,
  formatCrewMonthDay,
  formatCrewNameWithStars,
  formatCrewRank,
  formatCrewRequestDate,
  formatCrewScore,
  formatCrewScoreGap,
  formatCrewScoreLine,
  formatCrewUnrankedShort,
  getCrewErrorCode,
  getCrewErrorMessage,
  isCrewBoardOpen,
  isCrewFirstSeason,
  isCrewPodiumRank,
  isCrewStateDriftError,
  isValidCrewInviteCode,
  normalizeCrewInviteCode,
  resolveCrewFirstStarSeasonKey,
  resolveCrewRankedFromDate,
  shiftCrewSeasonKey,
  shouldFetchCrewLeague,
  sortCrewMembersForDisplay,
} from './crewModel';

function crewError(code: string, message = '서버 문구') {
  // 서버 sendError 본문 그대로: 최상위 code + details.code.
  return new ApiError('request', message, { status: 409, details: { message, code, details: { code } } });
}

function buildStanding(overrides: Partial<CrewStandingRow> = {}): CrewStandingRow {
  return {
    crewId: 'crew-mine',
    name: '새벽러너스',
    stars: 0,
    rank: 3,
    score: 66.25,
    totalKm: 330,
    seasonMemberCount: 3,
    runnerCount: 3,
    unrankedReason: null,
    isMine: true,
    ...overrides,
  };
}

function buildMember(overrides: Partial<CrewMemberRow> = {}): CrewMemberRow {
  return {
    userId: 'u1',
    name: '가람',
    role: 'member',
    contributionKm: 10,
    countsFrom: '2026-08-31T15:00:00.000Z',
    countedFrom: null,
    isMe: false,
    ...overrides,
  };
}

function buildSeason(overrides: Partial<CrewSeasonInfo> = {}): CrewSeasonInfo {
  return {
    seasonKey: '2026-11',
    label: '11월 시즌',
    isPreseason: false,
    isFirstSeason: false,
    firstStarSeasonKey: '2026-11',
    startsAt: '2026-10-31T15:00:00.000Z',
    endsAt: '2026-11-30T15:00:00.000Z',
    sealsAt: '2026-12-02T15:00:00.000Z',
    daysLeft: 12,
    priorKm: 30,
    status: 'live',
    ...overrides,
  };
}

test('에러 코드: 최상위 code와 안쪽 details.code 모두 읽고, 모르는 코드는 무시', () => {
  assert.equal(getCrewErrorCode(crewError('crew_full')), 'crew_full');
  assert.equal(
    getCrewErrorCode(new ApiError('request', 'x', { details: { message: 'x', details: { code: 'join_limit' } } })),
    'join_limit',
  );
  assert.equal(getCrewErrorCode(crewError('rate_limited')), null);
  assert.equal(getCrewErrorCode(new Error('plain')), null);
  assert.equal(getCrewErrorCode(null), null);
});

test('에러 코드 → 한국어 문구: 스펙의 모든 코드가 사람 말로 바뀐다', () => {
  const expectations: Record<string, RegExp> = {
    crew_full: /꽉 찼어요.*30명/,
    join_limit: /3번을 다 썼어요/,
    create_limit: /30일에 한 번/,
    invalid_name: /2~12자/,
    blocked_name: /쓸 수 없는 단어/,
    name_taken: /이미 있는 이름/,
    crew_banned: /30일 동안 다시 들어갈 수 없어요/,
    not_found: /크루를 찾지 못했어요/,
    not_captain: /캡틴만/,
    not_member: /멤버가 아니에요/,
    already_in_crew: /지금 크루를 나가야/,
    request_pending: /보내 둔 가입 신청/,
    request_cooldown: /조금 뒤에 다시 신청.*하루.*7일/,
  };

  for (const [code, pattern] of Object.entries(expectations)) {
    const message = getCrewErrorMessage(crewError(code), '실패했어요.');
    assert.match(message, pattern, code);
    assert.doesNotMatch(message, /!/, `${code}: 과장 느낌표 금지`);
  }
});

test('승인 맥락에선 주어가 신청자로 바뀌고, 없는 문구는 기본 문구를 쓴다', () => {
  assert.match(getCrewErrorMessage(crewError('already_in_crew'), 'x', 'decide'), /신청한 분이 그새 다른 크루/);
  assert.match(getCrewErrorMessage(crewError('crew_banned'), 'x', 'decide'), /내보낸 지 30일/);
  assert.match(getCrewErrorMessage(crewError('not_found'), 'x', 'decide'), /7일이 지나/);
  assert.match(getCrewErrorMessage(crewError('crew_full'), 'x', 'decide'), /꽉 찼어요/);
});

test('서버와 어긋난 거절(내보내짐·캡틴 이양·크루 닫힘)은 홈을 다시 부를 신호', () => {
  for (const code of ['not_found', 'not_member', 'not_captain', 'already_in_crew']) {
    assert.equal(isCrewStateDriftError(crewError(code)), true, code);
  }
  for (const code of ['crew_full', 'join_limit', 'request_cooldown', 'rate_limited']) {
    assert.equal(isCrewStateDriftError(crewError(code)), false, code);
  }
  assert.equal(isCrewStateDriftError(new Error('네트워크 오류')), false);
});

test('모르는 코드·일반 에러는 서버 문구, 그마저 없으면 폴백', () => {
  assert.equal(getCrewErrorMessage(crewError('rate_limited', '잠시 뒤 다시 시도해 주세요.'), '폴백'), '잠시 뒤 다시 시도해 주세요.');
  assert.equal(getCrewErrorMessage(new Error('네트워크 오류'), '폴백'), '네트워크 오류');
  assert.equal(getCrewErrorMessage(undefined, '폴백'), '폴백');
});

test('크루 이름: 앞뒤 공백은 자르고 2~12자·한글/영문/숫자·띄어쓰기 한 칸만', () => {
  assert.deepEqual(checkCrewName('  새벽러너스 '), { ok: true, name: '새벽러너스' });
  assert.deepEqual(checkCrewName('Seongsu RC 2'), { ok: true, name: 'Seongsu RC 2' });
  assert.equal(checkCrewName('').ok, false);
  assert.equal((checkCrewName('   ') as { reason: string }).reason, 'empty');
  assert.equal((checkCrewName('가') as { reason: string }).reason, 'too_short');
  assert.equal((checkCrewName('가나다라마바사아자차카타파') as { reason: string }).reason, 'too_long');
  assert.equal(checkCrewName('가나다라마바사아자차카타').ok, true); // 12자 경계
  assert.equal((checkCrewName('새벽  러너스') as { reason: string }).reason, 'invalid_chars');
  assert.equal((checkCrewName('새벽러너스!') as { reason: string }).reason, 'invalid_chars');
  assert.equal((checkCrewName('ㅋㅋ크루') as { reason: string }).reason, 'invalid_chars');
});

test('초대 코드: 대문자 6자로 정리, 링크째 붙여 넣어도 코드만', () => {
  assert.equal(normalizeCrewInviteCode('abc23k'), 'ABC23K');
  assert.equal(normalizeCrewInviteCode(' ab-c2 3k '), 'ABC23K');
  assert.equal(normalizeCrewInviteCode('ABC23KXYZ'), 'ABC23K');
  assert.equal(normalizeCrewInviteCode('https://api.running-ground.com/download?crew=abc23k'), 'ABC23K');
  assert.equal(normalizeCrewInviteCode('초대 코드: ABC23K\n앱에서 바로 가입: https://x/download?crew=ABC23K'), 'ABC23K');
  assert.equal(isValidCrewInviteCode('ABC23K'), true);
  assert.equal(isValidCrewInviteCode('ABC23'), false);
  // I, O, 0, 1은 알파벳에 없다.
  assert.equal(isValidCrewInviteCode('ABCIO0'), false);
  assert.equal(isValidCrewInviteCode('ABC231'), false);
});

test('코드 입력 안내 한 줄', () => {
  assert.equal(describeCrewInviteCodeInput('')?.tone, 'hint');
  assert.deepEqual(describeCrewInviteCodeInput('ABC'), { tone: 'hint', text: '3/6' });
  assert.equal(describeCrewInviteCodeInput('ABCDE0')?.tone, 'error');
  assert.equal(describeCrewInviteCodeInput('ABC23K'), null);
});

test('초대 공유 문구에 https 다운로드 ?crew= 링크가 실린다', () => {
  const message = buildCrewInviteShareMessage('새벽러너스', 'ABC23K');
  assert.match(message, /'새벽러너스'/);
  assert.match(message, /초대 코드: ABC23K/);
  assert.match(message, /https:\/\/api\.running-ground\.com\/download\?crew=ABC23K/);
  assert.doesNotMatch(message, /!/);
});

test('보정 인당: 식과 예시(원안 P=40 → 66.25), 표시는 늘 소수 둘째 자리', () => {
  assert.equal(computeCrewScore(330, 3, 40), 66.25);
  assert.equal(computeCrewScore(360, 4, 40), 62.22);
  assert.equal(computeCrewScore(1300, 20, 40), 60);
  assert.equal(computeCrewScore(330, 3, 30), 60);
  assert.equal(formatCrewScore(60), '60.00');
  assert.equal(formatCrewScore(66.254999), '66.25');
  assert.equal(formatCrewScoreLine(66.25), '보정 인당 66.25km');
  assert.equal(formatCrewScore(Number.NaN), '0.00');
});

test('기여 km: 서버 반올림(소수 2자리) 값을 뒤꼬리 0 없이', () => {
  assert.equal(formatCrewKm(42), '42');
  assert.equal(formatCrewKm(42.5), '42.5');
  assert.equal(formatCrewKm(121.2), '121.2');
  assert.equal(formatCrewKm(8.15), '8.15');
  assert.equal(formatCrewKm(8.154999), '8.15');
  assert.equal(formatCrewKm(0), '0');
  assert.equal(formatCrewKm(Number.NaN), '0');
});

test('이름 옆 별 ★n, 순위 표시와 시상대', () => {
  assert.equal(formatCrewNameWithStars('새벽러너스', 0), '새벽러너스');
  assert.equal(formatCrewNameWithStars('새벽러너스', 2), '새벽러너스 ★2');
  assert.equal(formatCrewRank(3), '3위');
  assert.equal(formatCrewRank(null), '순위 밖');
  assert.equal(isCrewPodiumRank(1), true);
  assert.equal(isCrewPodiumRank(3), true);
  assert.equal(isCrewPodiumRank(4), false);
  assert.equal(isCrewPodiumRank(null), false);
});

test('순위 밖 한 단어 사유', () => {
  assert.equal(formatCrewUnrankedShort('too_few_members'), '3명 미만');
  assert.equal(formatCrewUnrankedShort('no_distance'), '기록 없음');
  assert.equal(formatCrewUnrankedShort('newcomers_pending'), '합류 대기');
  assert.equal(formatCrewUnrankedShort(null), '순위 밖');
});

test('순위에 오른 크루가 3개 미만이면 순위표 대신 모집 중', () => {
  assert.equal(isCrewBoardOpen(2), false);
  assert.equal(isCrewBoardOpen(3), true);
});

test('1위와의 차이: 2위 이하는 1위와, 1위는 바로 아래와, 공동 1위는 그대로', () => {
  const top = [
    buildStanding({ crewId: 'a', rank: 1, score: 70.5, isMine: false }),
    buildStanding({ crewId: 'b', rank: 2, score: 68, isMine: false }),
    buildStanding({ crewId: 'crew-mine', rank: 3, score: 66.25 }),
  ];
  assert.equal(buildCrewGapLine(top[2], top), '1위와 4.25km 차이');
  assert.equal(buildCrewHeroMeta(top[2], top), '보정 인당 66.25km · 1위와 4.25km 차이');
  assert.equal(buildCrewGapLine(top[0], top), '2위와 2.50km 차이');

  const tied = [
    buildStanding({ crewId: 'crew-mine', rank: 1, score: 70 }),
    buildStanding({ crewId: 'b', rank: 1, score: 70, isMine: false }),
  ];
  assert.equal(buildCrewGapLine(tied[0], tied), '공동 1위');

  // 1위 혼자뿐이면 차이를 말하지 않는다.
  const alone = [buildStanding({ crewId: 'crew-mine', rank: 1, score: 70 })];
  assert.equal(buildCrewHeroMeta(alone[0], alone), '보정 인당 70.00km');
  assert.equal(buildCrewGapLine(buildStanding({ rank: null }), top), null);
  // 부동소수 꼬리 없이.
  assert.equal(formatCrewScoreGap(66.3, 66.1), '0.20');
});

test('멤버 행 합류 태그: 7일 규칙 날짜가 먼저, 기록 인정 전이면 그 날짜, 둘 다 지났으면 없음', () => {
  const nowMs = Date.parse('2026-10-05T03:00:00.000Z'); // 10/5 12:00 KST
  // 10/2 가입 → 10/3 0시 KST 인정 → 7일 뒤 10/10 0시 KST 합류.
  const newcomer = buildMember({ countsFrom: '2026-10-02T15:00:00.000Z', countedFrom: '2026-10-09T15:00:00.000Z' });
  assert.equal(formatCrewMemberJoinTag(newcomer, nowMs), '10/10 합류');
  // 오늘 가입 → 내일 0시 인정 (프리시즌처럼 이미 셈에 든 경우).
  const joinedToday = buildMember({ countsFrom: '2026-10-05T15:00:00.000Z', countedFrom: null });
  assert.equal(formatCrewMemberJoinTag(joinedToday, nowMs), '10/6 합류');
  assert.equal(formatCrewMemberJoinTag(buildMember(), nowMs), null);
  assert.equal(formatCrewMonthDay('2026-10-08T15:00:00.000Z'), '10/9');
  assert.equal(formatCrewMonthDay('not-a-date'), null);
});

test('신입 합류 대기 크루가 순위에 오르는 날 = 시즌 멤버가 3명 되는 날', () => {
  const members = [
    buildMember({ userId: 'a', countedFrom: null }),
    buildMember({ userId: 'b', countedFrom: '2026-10-11T15:00:00.000Z' }),
    buildMember({ userId: 'c', countedFrom: '2026-10-08T15:00:00.000Z' }),
  ];
  // 이미 1명 + 필요 2명 → 두 번째로 이른 날짜(10/12 KST).
  assert.equal(resolveCrewRankedFromDate(members), '2026-10-11T15:00:00.000Z');
  assert.equal(describeCrewUnranked('newcomers_pending', members), '10/12부터 순위에 올라요');
  assert.equal(describeCrewUnranked('newcomers_pending', []), '새 멤버가 합류하면 순위에 올라요');
  assert.equal(describeCrewUnranked('too_few_members'), '시즌 멤버가 3명이 되면 순위에 올라요');
  assert.equal(describeCrewUnranked('no_distance'), '멤버가 앱으로 달리면 순위에 올라요');
});

test('순위에 오르는 날은 서버 seasonMemberCount로 센다 — 7일을 채우고 나간 멤버도 N에 남는다', () => {
  // 지금 멤버: 기존 a + 신입 b(10/14 KST 합류), c(10/15 KST 합류). 나간 기존 멤버 e는 members[]엔 없지만
  // 서버 N엔 남아 N = 2 → 1명만 더 들어오면 된다 = b의 날짜.
  const members = [
    buildMember({ userId: 'a', countedFrom: null }),
    buildMember({ userId: 'b', countedFrom: '2026-10-13T15:00:00.000Z' }),
    buildMember({ userId: 'c', countedFrom: '2026-10-14T15:00:00.000Z' }),
  ];
  assert.equal(resolveCrewRankedFromDate(members, 2), '2026-10-13T15:00:00.000Z');
  assert.equal(describeCrewUnranked('newcomers_pending', members, 2), '10/14부터 순위에 올라요');
  // 지금 멤버만 세면 1명 + 2명 필요 → 늦은 날짜(10/15)가 나왔다.
  assert.equal(describeCrewUnranked('newcomers_pending', members), '10/15부터 순위에 올라요');
  // 신입 한 명뿐이어도 N = 2면 그 사람 날짜가 나온다(지금 멤버만 세면 일반 문구로 떨어졌다).
  const single = members.slice(0, 2);
  assert.equal(describeCrewUnranked('newcomers_pending', single, 2), '10/14부터 순위에 올라요');
  assert.equal(describeCrewUnranked('newcomers_pending', single), '새 멤버가 합류하면 순위에 올라요');
});

test('멤버 정렬: 기여 큰 순, 같으면 이름 순', () => {
  const sorted = sortCrewMembersForDisplay([
    buildMember({ userId: 'a', name: '다온', contributionKm: 5 }),
    buildMember({ userId: 'b', name: '가람', contributionKm: 12.5 }),
    buildMember({ userId: 'c', name: '나래', contributionKm: 5 }),
  ]);
  assert.deepEqual(sorted.map((member) => member.userId), ['b', 'c', 'a']);
});

test('시즌 키 이동은 연말·연초를 넘는다', () => {
  assert.equal(shiftCrewSeasonKey('2026-12', 1), '2027-01');
  assert.equal(shiftCrewSeasonKey('2026-01', -1), '2025-12');
  assert.equal(shiftCrewSeasonKey('2026-09', 1), '2026-10');
});

test('시즌 상태 한 줄: 남은 날·마지막 날·집계 중·확정', () => {
  assert.equal(buildCrewSeasonStatusLine(buildSeason()), '11월 시즌 · 12일 남음');
  assert.equal(buildCrewSeasonStatusLine(buildSeason({ daysLeft: 0 })), '11월 시즌 · 오늘 끝나요');
  // 봉인 = 12/2 15:00Z = 12/3 0시 KST.
  assert.equal(buildCrewSeasonStatusLine(buildSeason({ status: 'tallying', daysLeft: 0 })), '11월 시즌 · 집계 중 · 12/3 0시 확정');
  assert.equal(buildCrewSeasonStatusLine(buildSeason({ status: 'sealed', daysLeft: 0 })), '11월 시즌 · 확정');
});

// 프리시즌이 9·10월 두 달이라(오너 2026-09-18 연장) '다음 달'이 아니라 서버의 첫 별 시즌을 가리킨다.
const SEPTEMBER_PRESEASON = { seasonKey: '2026-09', label: '9월 프리시즌', isPreseason: true, isFirstSeason: true };
const OCTOBER_PRESEASON = { seasonKey: '2026-10', label: '10월 프리시즌', isPreseason: true };

test('프리시즌 안내는 프리시즌에만, 서버가 준 첫 별 시즌을 가리킨다', () => {
  assert.equal(buildCrewPreseasonNote(buildSeason(SEPTEMBER_PRESEASON)), '프리시즌이에요 · 별은 11월 시즌부터 받아요');
  assert.equal(buildCrewPreseasonNote(buildSeason(OCTOBER_PRESEASON)), '프리시즌이에요 · 별은 11월 시즌부터 받아요');
  assert.equal(buildCrewPreseasonNote(buildSeason()), null);
});

test('두 필드가 없는 구 백엔드 응답(86c4a059)도 죽지 않고 그 서버의 뜻대로 읽는다', () => {
  // 구 백엔드는 프리시즌이 9월 한 달 = 첫 시즌, 별은 다음 달부터였다.
  const legacySeptember = buildSeason({ seasonKey: '2026-09', label: '9월 프리시즌', isPreseason: true });
  delete legacySeptember.isFirstSeason;
  delete legacySeptember.firstStarSeasonKey;
  assert.equal(resolveCrewFirstStarSeasonKey(legacySeptember), '2026-10');
  assert.equal(buildCrewPreseasonNote(legacySeptember), '프리시즌이에요 · 별은 10월 시즌부터 받아요');
  assert.equal(buildCrewHeroSeasonNote(legacySeptember), '프리시즌 · 12일 남음 · 별은 10월 시즌부터');
  assert.equal(isCrewFirstSeason(legacySeptember), true);

  // 새 백엔드 값이 있으면 그 값이 이긴다.
  assert.equal(resolveCrewFirstStarSeasonKey(buildSeason(OCTOBER_PRESEASON)), '2026-11');
  assert.equal(isCrewFirstSeason(buildSeason(OCTOBER_PRESEASON)), false);
  assert.equal(isCrewFirstSeason(buildSeason(SEPTEMBER_PRESEASON)), true);
});

test('내 크루 히어로의 시즌 한 줄', () => {
  assert.equal(buildCrewHeroSeasonNote(buildSeason()), '11월 시즌 · 12일 남음');
  assert.equal(
    buildCrewHeroSeasonNote(buildSeason({ ...SEPTEMBER_PRESEASON, daysLeft: 0 })),
    '프리시즌 · 오늘 끝나요 · 별은 11월 시즌부터',
  );
  assert.equal(buildCrewHeroSeasonNote(buildSeason({ ...OCTOBER_PRESEASON, daysLeft: 3 })), '프리시즌 · 3일 남음 · 별은 11월 시즌부터');
  assert.equal(buildCrewHeroSeasonNote(buildSeason({ status: 'tallying', daysLeft: 0 })), '11월 시즌 · 집계 중 · 12/3 0시 확정');
});

test('시즌 순위표 재조회: 봉인 스냅샷만 영구 캐시, 집계 중 응답은 재진입·refreshKey 변화 때 다시', () => {
  const base = { enabled: true, wasEnabled: true, refreshKeyChanged: false };
  assert.equal(shouldFetchCrewLeague({ ...base, cached: 'none' }), true);
  assert.equal(shouldFetchCrewLeague({ ...base, enabled: false, cached: 'none' }), false);
  // 켜진 채 그대로면 다시 부르지 않는다(무한 재조회 방지).
  assert.equal(shouldFetchCrewLeague({ ...base, cached: 'unsealed' }), false);
  // 12/2 '집계 중'을 받은 뒤: 세그먼트 재진입 또는 봉인으로 홈의 lastSeason 키가 바뀌면 다시.
  assert.equal(shouldFetchCrewLeague({ ...base, cached: 'unsealed', wasEnabled: false }), true);
  assert.equal(shouldFetchCrewLeague({ ...base, cached: 'unsealed', refreshKeyChanged: true }), true);
  // 봉인 스냅샷은 절대 다시 안 부른다. 불러오는 중·에러도 여기서는 안 건드린다.
  assert.equal(shouldFetchCrewLeague({ ...base, cached: 'sealed', wasEnabled: false, refreshKeyChanged: true }), false);
  assert.equal(shouldFetchCrewLeague({ ...base, cached: 'other', wasEnabled: false }), false);
});

test('지난 시즌 머리 한 줄', () => {
  const season = buildSeason({ status: 'sealed', daysLeft: 0 });
  assert.equal(buildCrewLastSeasonHeadline({ season, sealed: true, champions: [{ name: '새벽러너스' }] }), '11월 시즌 우승 · 새벽러너스 ★');
  assert.equal(
    buildCrewLastSeasonHeadline({ season, sealed: true, champions: [{ name: 'A' }, { name: 'B' }] }),
    '11월 시즌 공동 우승 · A ★, B ★',
  );
  assert.equal(buildCrewLastSeasonHeadline({ season, sealed: true, champions: [] }), '11월 시즌 · 우승 크루가 없었어요');
  assert.equal(
    buildCrewLastSeasonHeadline({ season: buildSeason({ status: 'tallying' }), sealed: false, champions: [] }),
    '11월 시즌 · 집계 중 · 12/3 0시 확정',
  );
  assert.equal(
    buildCrewLastSeasonHeadline({
      season: buildSeason({ label: '9월 프리시즌', isPreseason: true, status: 'sealed' }),
      sealed: true,
      champions: [],
    }),
    '9월 프리시즌 · 별 없이 순위만 남겼어요',
  );
});

test('가입 확인 문구 = 오너 스펙 문장, N은 이번 가입을 쓰고 남는 횟수', () => {
  assert.equal(
    buildCrewJoinConfirmMessage(3),
    '내일 0시부터 기록이 크루 점수에 들어가요. 이번 달엔 크루를 2번 더 옮길 수 있어요.',
  );
  assert.equal(
    buildCrewJoinConfirmMessage(1, true),
    '내일 0시부터 기록이 크루 점수에 들어가요. 이번 달엔 크루를 더 옮길 수 없어요. 보내 둔 가입 신청은 취소돼요.',
  );
  assert.match(buildCrewCreateConfirmMessage(2), /30일에 한 번.*1번 더/);
  // 횟수를 못 받았으면 이동 횟수 문장은 빼고 겁주지 않는다.
  assert.equal(buildCrewJoinConfirmMessage(null), '내일 0시부터 기록이 크루 점수에 들어가요.');
  assert.doesNotMatch(buildCrewCreateConfirmMessage(null), /옮길/);
  // 만들기도 보내 둔 가입 신청을 취소한다 — 코드 가입과 같은 문장으로 미리 말한다.
  assert.match(buildCrewCreateConfirmMessage(2, true), /1번 더.*보내 둔 가입 신청은 취소돼요\.$/);
  assert.doesNotMatch(buildCrewCreateConfirmMessage(2), /가입 신청/);
});

test('신청 취소 확인은 같은 크루 재신청 대기(하루)를 미리 말한다', () => {
  assert.equal(
    buildCrewCancelRequestConfirmMessage('새벽러너스'),
    '새벽러너스에 보낸 가입 신청을 취소할까요? 취소하면 이 크루에는 하루 뒤에 다시 신청할 수 있어요.',
  );
});

test('크루 찾기 안내: 둘러보기인데 크루가 없으면 이름 탓 대신 첫 크루를 권한다', () => {
  assert.deepEqual(describeCrewSearchResults('', 0), { hint: null, empty: '아직 만들어진 크루가 없어요. 첫 크루를 만들어 보세요.' });
  assert.deepEqual(describeCrewSearchResults('새벽', 0), {
    hint: "'새벽' 검색 결과",
    empty: '찾는 크루가 없어요. 이름을 다시 확인해 주세요.',
  });
  assert.equal(describeCrewSearchResults('', 3).hint, '이번 시즌 순위 순서예요. 눌러서 보고 가입 신청할 수 있어요.');
  assert.equal(describeCrewSearchResults('', 3).empty, null);
  assert.equal(describeCrewSearchResults('새벽', 1).hint, "'새벽' 검색 결과");
});

test('나가기·내보내기 확인 문구', () => {
  assert.match(buildCrewLeaveConfirmMessage({ joinsLeftThisMonth: 2, isCaptain: true, memberCount: 5 }), /캡틴은 가장 먼저 들어온 멤버에게.*2번 더/);
  assert.match(buildCrewLeaveConfirmMessage({ joinsLeftThisMonth: 0, isCaptain: true, memberCount: 1 }), /크루가 닫혀요.*더 들어갈 수 없어요/);
  assert.doesNotMatch(buildCrewLeaveConfirmMessage({ joinsLeftThisMonth: 1, isCaptain: false, memberCount: 4 }), /캡틴/);
  assert.match(buildCrewKickConfirmMessage('나래', false), /30일 동안.*7일 넘게/);
  assert.doesNotMatch(buildCrewKickConfirmMessage('나래', true), /7일/);
});

test('점수 설명: 고정된 기준 P를 실제 값으로, 예시 하나, 규칙 4줄', () => {
  assert.equal(buildCrewScoreFormulaLine(30), '보정 인당 = (크루 총거리 + 기준 30km × 5) ÷ (시즌 멤버 + 5)');
  assert.equal(buildCrewScoreExampleLine(30), '예: 3명이 330km를 달리면 (330 + 150) ÷ 8 = 60.00km');
  assert.equal(buildCrewScoreExampleLine(40), '예: 3명이 330km를 달리면 (330 + 200) ÷ 8 = 66.25km');
  const rules = buildCrewScoreRuleLines(false);
  assert.equal(rules.length, 4);
  assert.match(rules.join('\n'), /앱으로 기록한 러닝만[\s\S]*하루 45km[\s\S]*7일 뒤 합류[\s\S]*48시간 뒤 확정/);
  assert.match(buildCrewScoreRuleLines(true)[2], /프리시즌/);
});

test('신청 날짜·검색 메타', () => {
  assert.equal(formatCrewRequestDate('2026-10-08T15:00:00.000Z'), '10/9 신청');
  assert.equal(buildCrewSearchMeta(12, 3), '12명 · 3위');
  assert.equal(buildCrewSearchMeta(2, null), '2명 · 순위 밖');
});
