// 크루대전 목 (웹 미리보기 전용, USE_MOCK_API일 때만). 서버 규칙을 흉내만 낸다 — 점수는 같은
// 식((T + 5P) ÷ (N + 5), P 고정 30km)으로 매기고, 순위·에러 코드도 서버 계약과 같은 모양으로 낸다.
//
// 화면을 한 번에 다 볼 수 있게 짠 판: 내 크루(캡틴, 3위) + 오늘 들어온 신입 1명, 순위 크루 6개
// (탭 카드는 5개로 잘리고 '전체 순위'에 6번째), 순위 밖 2개(3명 미만 / 기록 없음), 가입 신청 2건,
// 지난 시즌 우승 크루. 지난 시즌은 출시 달(프리시즌)엔 실제로는 없지만, '지난 시즌' 화면을
// 눈으로 확인할 수 있게 목에서만 한 달 앞 봉인 스냅샷을 둔다.

import { myProfile } from '@/data/mock';
import {
  CREW_MAX_MEMBERS,
  CREW_MIN_RANKED_MEMBERS,
  checkCrewName,
  computeCrewScore,
  isValidCrewInviteCode,
  normalizeCrewInviteCode,
  shiftCrewSeasonKey,
} from '@/features/crew/crewModel';
import { ApiError } from '@/services/apiError';
import type {
  CrewDetailResponse,
  CrewHomeResponse,
  CrewJoinRequestRow,
  CrewLeagueResponse,
  CrewMemberRow,
  CrewPreviewResponse,
  CrewRequestsResponse,
  CrewSearchResponse,
  CrewSeasonInfo,
  CrewStandingRow,
  CrewSummary,
  CrewUnrankedReason,
} from '../../types';

const MOCK_ME_ID = 'mock-user';
// 서버 crewConstants와 같은 달력: 프리시즌 9·10월(오너 2026-09-18 연장), 첫 별 시즌 11월.
const MOCK_FIRST_SEASON_KEY = '2026-09';
const MOCK_PRESEASON_LAST_KEY = '2026-10';
const MOCK_FIRST_STAR_SEASON_KEY = '2026-11';
const MOCK_PRIOR_KM = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MOCK_BLOCKED_WORDS = ['러닝그라운드', '운영', '관리자', 'admin', 'official', '공식'];

type MockCrewMember = {
  userId: string;
  name: string;
  role: 'captain' | 'member';
  contributionKm: number;
  countsFrom: string;
  countedFrom: string | null;
};

type MockCrew = {
  id: string;
  name: string;
  inviteCode: string;
  stars: number;
  createdAt: string;
  closed: boolean;
  bannedUserIds: string[];
  members: MockCrewMember[];
};

type MockJoinRequest = {
  requestId: string;
  crewId: string;
  userId: string;
  name: string;
  createdAt: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
};

function kstMonthKey(ms: number) {
  const shifted = new Date(ms + KST_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

function seasonStartMs(seasonKey: string) {
  return Date.parse(`${seasonKey}-01T00:00:00+09:00`);
}

// 다음 KST 0시 — 가입한 날의 기록은 안 들어가고 내일 0시부터 인정된다.
function nextKstMidnightIso(ms: number) {
  const shifted = new Date(ms + KST_OFFSET_MS);
  const nextDayUtc = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + 1);
  return new Date(nextDayUtc - KST_OFFSET_MS).toISOString();
}

function isMockPreseason(seasonKey: string): boolean {
  return seasonKey >= MOCK_FIRST_SEASON_KEY && seasonKey <= MOCK_PRESEASON_LAST_KEY;
}

// 서버 pushMembershipRow와 같은 인정 시작: 프리시즌은 들어온 순간, 정규 시즌은 다음 KST 0시.
function mockCountsFromIso(nowMs: number): string {
  return isMockPreseason(kstMonthKey(nowMs)) ? new Date(nowMs).toISOString() : nextKstMidnightIso(nowMs);
}

function buildSeasonInfo(seasonKey: string, nowMs: number): CrewSeasonInfo {
  const startsAtMs = seasonStartMs(seasonKey);
  const endsAtMs = seasonStartMs(shiftCrewSeasonKey(seasonKey, 1));
  // 서버처럼 달 끝 1시간 뒤 확정 (오너 2026-09-18).
  const sealsAtMs = endsAtMs + 60 * 60 * 1000;
  const isPreseason = isMockPreseason(seasonKey);
  const month = Number(seasonKey.split('-')[1]);
  const status: CrewSeasonInfo['status'] = nowMs < endsAtMs ? 'live' : nowMs < sealsAtMs ? 'tallying' : 'sealed';

  return {
    seasonKey,
    label: isPreseason ? `${month}월 프리시즌` : `${month}월 시즌`,
    isPreseason,
    isFirstSeason: seasonKey === MOCK_FIRST_SEASON_KEY,
    firstStarSeasonKey: MOCK_FIRST_STAR_SEASON_KEY,
    startsAt: new Date(startsAtMs).toISOString(),
    endsAt: new Date(endsAtMs).toISOString(),
    sealsAt: new Date(sealsAtMs).toISOString(),
    daysLeft: status === 'live' ? Math.max(0, Math.floor((endsAtMs - nowMs) / DAY_MS)) : 0,
    priorKm: MOCK_PRIOR_KM,
    status,
  };
}

function randomInviteCode() {
  let code = '';
  for (let index = 0; index < 6; index += 1) {
    code += INVITE_CODE_ALPHABET[Math.floor(Math.random() * INVITE_CODE_ALPHABET.length)];
  }
  return code;
}

function toNameKey(name: string) {
  return name.toLowerCase().replace(/\s+/g, '');
}

function mockCrewError(status: number, code: string, message: string): ApiError {
  return new ApiError('request', message, { status, details: { message, code, details: { code } } });
}

// 기여 km 목록으로 멤버를 만든다 — 모두 지난달부터 있던(이미 셈에 든) 멤버.
function seedMembers(crewId: string, names: string[], contributions: number[], seasonKey: string): MockCrewMember[] {
  const countsFrom = new Date(seasonStartMs(seasonKey) - 10 * DAY_MS).toISOString();
  return names.map((name, index) => ({
    userId: `${crewId}-m${index + 1}`,
    name,
    role: index === 0 ? 'captain' : 'member',
    contributionKm: contributions[index] ?? 0,
    countsFrom,
    countedFrom: null,
  }));
}

function createInitialMockCrewState() {
  const nowMs = Date.now();
  const seasonKey = kstMonthKey(nowMs);
  const isPreseason = isMockPreseason(seasonKey);
  const seasonStartIso = new Date(seasonStartMs(seasonKey) - 10 * DAY_MS).toISOString();
  const newcomerCountsFrom = mockCountsFromIso(nowMs);

  const mine: MockCrew = {
    id: 'crew-dawn',
    name: '새벽러너스',
    inviteCode: 'ABC23K',
    stars: 1,
    createdAt: '2026-08-20T00:00:00.000Z',
    closed: false,
    bannedUserIds: [],
    members: [
      { userId: MOCK_ME_ID, name: myProfile.name, role: 'captain', contributionKm: 98.3, countsFrom: seasonStartIso, countedFrom: null },
      { userId: 'crew-dawn-m2', name: '김관우', role: 'member', contributionKm: 121.2, countsFrom: seasonStartIso, countedFrom: null },
      { userId: 'crew-dawn-m3', name: '이서준', role: 'member', contributionKm: 84.75, countsFrom: seasonStartIso, countedFrom: null },
      { userId: 'crew-dawn-m4', name: '박지훈', role: 'member', contributionKm: 52.1, countsFrom: seasonStartIso, countedFrom: null },
      // 방금 들어온 신입 — 프리시즌은 바로, 정규 시즌이면 내일 0시부터 기록 인정·7일 뒤 인원수에 합류.
      {
        userId: 'crew-dawn-m5',
        name: '정이안',
        role: 'member',
        contributionKm: 0,
        countsFrom: newcomerCountsFrom,
        countedFrom: isPreseason ? null : new Date(Date.parse(newcomerCountsFrom) + 7 * DAY_MS).toISOString(),
      },
    ],
  };

  const crews: MockCrew[] = [
    mine,
    {
      id: 'crew-hangang',
      name: '한강나이트런',
      inviteCode: 'HGN8RT',
      stars: 2,
      createdAt: '2026-08-02T00:00:00.000Z',
      closed: false,
      bannedUserIds: [],
      members: seedMembers('crew-hangang', ['윤하람', '서지우', '한도윤', '오세린', '장민재', '백하윤', '임도현', '권나은'], [118.4, 96.2, 88.35, 80, 74.8, 66.2, 50.45, 38], seasonKey),
    },
    {
      id: 'crew-seongsu',
      name: '성수 RC',
      inviteCode: 'SSRC24',
      stars: 0,
      createdAt: '2026-08-11T00:00:00.000Z',
      closed: false,
      bannedUserIds: [],
      members: seedMembers('crew-seongsu', ['문태오', '신예나', '조하민', '류시우', '남궁별'], [112.35, 95.5, 82.1, 64.4, 48], seasonKey),
    },
    {
      id: 'crew-busan',
      name: '달려라 부산',
      inviteCode: 'BSN5GO',
      stars: 0,
      createdAt: '2026-08-15T00:00:00.000Z',
      closed: false,
      bannedUserIds: [],
      members: seedMembers('crew-busan', ['강해솔', '유다은', '차준서', '표나리'], [92.3, 74.5, 55, 39], seasonKey),
    },
    {
      id: 'crew-afterwork',
      name: '퇴근런클럽',
      inviteCode: 'TGR7CL',
      stars: 0,
      createdAt: '2026-08-05T00:00:00.000Z',
      closed: false,
      bannedUserIds: [],
      members: seedMembers(
        'crew-afterwork',
        ['홍서아', '고은호', '양지안', '석하늘', '마로운', '인채원', '방건우', '기서진', '탁유나', '변시온', '편도하', '노아린'],
        [82, 71.5, 64.2, 55, 49.8, 44, 40.3, 36.2, 31, 27.5, 22.5, 16],
        seasonKey,
      ),
    },
    {
      id: 'crew-gwanggyo',
      name: '광교 호수런',
      inviteCode: 'GGL6KM',
      stars: 0,
      createdAt: '2026-08-25T00:00:00.000Z',
      closed: false,
      bannedUserIds: [],
      members: seedMembers('crew-gwanggyo', ['엄소율', '독고린', '제갈윤', '황보람', '선우진', '어라온'], [48, 36.5, 28, 20.5, 11, 6], seasonKey),
    },
    {
      id: 'crew-weekend',
      name: '주말 장거리',
      inviteCode: 'WKD3LG',
      stars: 0,
      createdAt: '2026-09-01T00:00:00.000Z',
      closed: false,
      bannedUserIds: [],
      members: seedMembers('crew-weekend', ['경하진', '담서윤'], [52.4, 36], seasonKey),
    },
    {
      id: 'crew-yeonnam',
      name: '연남 모닝런',
      inviteCode: 'YNM4RN',
      stars: 0,
      createdAt: '2026-09-10T00:00:00.000Z',
      closed: false,
      bannedUserIds: [],
      members: seedMembers('crew-yeonnam', ['설하온', '빈도아', '옥지유'], [0, 0, 0], seasonKey),
    },
  ];

  const requests: MockJoinRequest[] = [
    {
      requestId: 'crew-request-1',
      crewId: mine.id,
      userId: 'mock-applicant-1',
      name: '한예린',
      createdAt: new Date(nowMs - 2 * DAY_MS).toISOString(),
      status: 'pending',
    },
    {
      requestId: 'crew-request-2',
      crewId: mine.id,
      userId: 'mock-applicant-2',
      name: '박도윤',
      createdAt: new Date(nowMs - 5 * 60 * 60 * 1000).toISOString(),
      status: 'pending',
    },
  ];

  return {
    crews,
    requests,
    joinsLeftThisMonth: 2,
    createdCrewThisSession: false,
    nextRequestSeq: 3,
  };
}

const mockCrewState = createInitialMockCrewState();

function openCrews() {
  return mockCrewState.crews.filter((crew) => !crew.closed);
}

function findMyCrew() {
  return openCrews().find((crew) => crew.members.some((member) => member.userId === MOCK_ME_ID)) ?? null;
}

function findOpenCrew(crewId: string) {
  const crew = openCrews().find((entry) => entry.id === crewId);
  if (!crew) {
    throw mockCrewError(404, 'not_found', '크루를 찾지 못했어요.');
  }
  return crew;
}

function findMyPendingRequest() {
  return mockCrewState.requests.find((request) => request.userId === MOCK_ME_ID && request.status === 'pending') ?? null;
}

function requireCaptainOf(crewId: string) {
  const crew = findOpenCrew(crewId);
  const me = crew.members.find((member) => member.userId === MOCK_ME_ID);
  if (!me) {
    throw mockCrewError(403, 'not_member', '이 크루의 멤버가 아니에요.');
  }
  if (me.role !== 'captain') {
    throw mockCrewError(403, 'not_captain', '캡틴만 할 수 있어요.');
  }
  return crew;
}

function summarizeCrew(crew: MockCrew): CrewSummary {
  return {
    id: crew.id,
    name: crew.name,
    stars: crew.stars,
    memberCount: crew.members.length,
    captainName: crew.members.find((member) => member.role === 'captain')?.name ?? '알 수 없음',
  };
}

function toMemberRow(member: MockCrewMember): CrewMemberRow {
  return {
    userId: member.userId,
    name: member.name,
    role: member.role,
    contributionKm: member.contributionKm,
    countsFrom: member.countsFrom,
    countedFrom: member.countedFrom,
    isMe: member.userId === MOCK_ME_ID,
  };
}

// 서버 buildCrewSeasonStandings 흉내: 점수 → T → N → R → 생성일 순, (점수, T, N)이 같으면 공동 순위.
function buildLiveStandings(): { ranked: CrewStandingRow[]; unranked: CrewStandingRow[] } {
  const rows = openCrews().map((crew) => {
    const seasonMembers = crew.members.filter((member) => member.countedFrom === null);
    const pendingMembers = crew.members.length - seasonMembers.length;
    const totalKm = Number(seasonMembers.reduce((sum, member) => sum + member.contributionKm, 0).toFixed(2));
    const runnerCount = seasonMembers.filter((member) => member.contributionKm > 0).length;
    const score = computeCrewScore(totalKm, seasonMembers.length);
    let unrankedReason: CrewUnrankedReason | null = null;

    if (seasonMembers.length < CREW_MIN_RANKED_MEMBERS) {
      unrankedReason = seasonMembers.length + pendingMembers >= CREW_MIN_RANKED_MEMBERS ? 'newcomers_pending' : 'too_few_members';
    } else if (totalKm <= 0) {
      unrankedReason = 'no_distance';
    }

    return {
      createdAt: crew.createdAt,
      memberCount: crew.members.length,
      row: {
        crewId: crew.id,
        name: crew.name,
        stars: crew.stars,
        rank: null as number | null,
        score,
        totalKm,
        seasonMemberCount: seasonMembers.length,
        runnerCount,
        unrankedReason,
        isMine: crew.members.some((member) => member.userId === MOCK_ME_ID),
      },
    };
  });

  const ranked = rows
    .filter((entry) => entry.row.unrankedReason === null)
    .sort((left, right) => (
      right.row.score - left.row.score
      || right.row.totalKm - left.row.totalKm
      || right.row.seasonMemberCount - left.row.seasonMemberCount
      || right.row.runnerCount - left.row.runnerCount
      || Date.parse(left.createdAt) - Date.parse(right.createdAt)
    ))
    .map((entry) => entry.row);

  for (const row of ranked) {
    row.rank = 1 + ranked.filter((other) => (
      other.score > row.score
      || (other.score === row.score && other.totalKm > row.totalKm)
      || (other.score === row.score && other.totalKm === row.totalKm && other.seasonMemberCount > row.seasonMemberCount)
    )).length;
  }

  // 순위 밖은 인원 많은 순 (서버 검색 기본 정렬과 같은 규칙).
  const unranked = rows
    .filter((entry) => entry.row.unrankedReason !== null)
    .sort((left, right) => right.memberCount - left.memberCount)
    .map((entry) => entry.row);

  return { ranked, unranked };
}

function findStanding(crewId: string): CrewStandingRow {
  const { ranked, unranked } = buildLiveStandings();
  const standing = [...ranked, ...unranked].find((row) => row.crewId === crewId);
  if (!standing) {
    throw mockCrewError(404, 'not_found', '크루를 찾지 못했어요.');
  }
  return standing;
}

// 봉인된 지난 시즌 스냅샷 (목 고정값). 봉인 뒤엔 다시 계산하지 않는다는 서버 원칙대로 상수다.
function buildLastSeasonSnapshot(): CrewStandingRow[] {
  const myCrewId = findMyCrew()?.id ?? null;
  const rows: [string, string, number, number, number, number][] = [
    ['crew-hangang', '한강나이트런', 61.42, 648.5, 8, 2],
    ['crew-dawn', '새벽러너스', 57.9, 313.2, 4, 1],
    ['crew-seongsu', '성수 RC', 54.18, 391.8, 5, 0],
    ['crew-afterwork', '퇴근런클럽', 47.35, 654.9, 12, 0],
    ['crew-busan', '달려라 부산', 43.2, 238.8, 4, 0],
    ['crew-gwanggyo', '광교 호수런', 33.64, 220, 6, 0],
  ];

  return rows.map(([crewId, name, score, totalKm, memberCount, stars], index) => ({
    crewId,
    name,
    stars,
    rank: index + 1,
    score,
    totalKm,
    seasonMemberCount: memberCount,
    runnerCount: memberCount,
    unrankedReason: null,
    isMine: crewId === myCrewId,
  }));
}

function buildLastSeason(nowMs: number) {
  const seasonKey = shiftCrewSeasonKey(kstMonthKey(nowMs), -1);
  const info = buildSeasonInfo(seasonKey, nowMs);
  return {
    seasonKey,
    label: info.label,
    // 서버처럼 프리시즌(9·10월)은 우승이 없다.
    champions: info.isPreseason ? [] : [{ crewId: 'crew-hangang', name: '한강나이트런' }],
  };
}

export function buildMockCrewHome(): CrewHomeResponse {
  const nowMs = Date.now();
  const season = buildSeasonInfo(kstMonthKey(nowMs), nowMs);
  const { ranked } = buildLiveStandings();
  const myCrew = findMyCrew();
  const pendingRequest = findMyPendingRequest();
  const me = myCrew?.members.find((member) => member.userId === MOCK_ME_ID) ?? null;

  return {
    season,
    myCrew: myCrew && me ? {
      crew: summarizeCrew(myCrew),
      inviteCode: myCrew.inviteCode,
      role: me.role,
      standing: findStanding(myCrew.id),
      members: myCrew.members.map(toMemberRow),
      pendingRequestCount: me.role === 'captain'
        ? mockCrewState.requests.filter((request) => request.crewId === myCrew.id && request.status === 'pending').length
        : 0,
    } : null,
    top: ranked.slice(0, 5),
    rankedCrewCount: ranked.length,
    lastSeason: buildLastSeason(nowMs),
    myPendingRequest: pendingRequest ? {
      requestId: pendingRequest.requestId,
      crewId: pendingRequest.crewId,
      crewName: mockCrewState.crews.find((crew) => crew.id === pendingRequest.crewId)?.name ?? '알 수 없음',
      createdAt: pendingRequest.createdAt,
    } : null,
    joinsLeftThisMonth: mockCrewState.joinsLeftThisMonth,
  };
}

export function buildMockCrewLeague(seasonKey?: string): CrewLeagueResponse {
  const nowMs = Date.now();
  const currentKey = kstMonthKey(nowMs);
  const targetKey = seasonKey || currentKey;

  if (targetKey === currentKey) {
    const { ranked, unranked } = buildLiveStandings();
    return { season: buildSeasonInfo(currentKey, nowMs), sealed: false, ranked, unranked };
  }

  if (targetKey === shiftCrewSeasonKey(currentKey, -1)) {
    return {
      season: { ...buildSeasonInfo(targetKey, nowMs), status: 'sealed', daysLeft: 0 },
      sealed: true,
      ranked: buildLastSeasonSnapshot(),
      unranked: [],
    };
  }

  throw mockCrewError(404, 'not_found', '그 시즌 기록이 없어요.');
}

export function buildMockCrewDetail(crewId: string): CrewDetailResponse {
  const crew = findOpenCrew(crewId);
  const myCrew = findMyCrew();
  const pendingRequest = findMyPendingRequest();
  const isBanned = crew.bannedUserIds.includes(MOCK_ME_ID);

  return {
    crew: summarizeCrew(crew),
    standing: findStanding(crew.id),
    members: crew.members.map(toMemberRow),
    canRequest: !myCrew && !pendingRequest && !isBanned && crew.members.length < CREW_MAX_MEMBERS,
    myRequestPending: pendingRequest?.crewId === crew.id,
  };
}

export function buildMockCrewSearch(query: string): CrewSearchResponse {
  const { ranked, unranked } = buildLiveStandings();
  const ordered = [...ranked, ...unranked];
  const key = toNameKey(query.trim());
  const matches = key
    ? ordered.filter((row) => toNameKey(row.name).includes(key))
    : ordered;

  return {
    crews: matches.slice(0, 20).map((row) => ({ ...summarizeCrew(findOpenCrew(row.crewId)), rank: row.rank })),
  };
}

export function buildMockCrewPreview(rawCode: string): CrewPreviewResponse {
  const code = normalizeCrewInviteCode(rawCode);
  const crew = isValidCrewInviteCode(code) ? openCrews().find((entry) => entry.inviteCode === code) : undefined;

  if (!crew) {
    throw mockCrewError(404, 'not_found', '크루를 찾지 못했어요.');
  }

  return { crew: summarizeCrew(crew), standing: findStanding(crew.id) };
}

function joinCrewAsMe(crew: MockCrew) {
  if (findMyCrew()) {
    throw mockCrewError(409, 'already_in_crew', '이미 크루에 들어가 있어요.');
  }
  if (crew.bannedUserIds.includes(MOCK_ME_ID)) {
    throw mockCrewError(403, 'crew_banned', '이 크루에는 30일 동안 다시 들어갈 수 없어요.');
  }
  if (crew.members.length >= CREW_MAX_MEMBERS) {
    throw mockCrewError(409, 'crew_full', '인원이 꽉 찼어요.');
  }
  if (mockCrewState.joinsLeftThisMonth <= 0) {
    throw mockCrewError(409, 'join_limit', '이번 달 크루 이동을 다 썼어요.');
  }

  const nowMs = Date.now();
  const countsFrom = mockCountsFromIso(nowMs);
  const isPreseason = isMockPreseason(kstMonthKey(nowMs));
  crew.members.push({
    userId: MOCK_ME_ID,
    name: myProfile.name,
    role: 'member',
    contributionKm: 0,
    countsFrom,
    countedFrom: isPreseason ? null : new Date(Date.parse(countsFrom) + 7 * DAY_MS).toISOString(),
  });
  mockCrewState.joinsLeftThisMonth -= 1;

  // 코드로 어디든 들어가면 보내 둔 가입 신청은 자동 취소.
  const pendingRequest = findMyPendingRequest();
  if (pendingRequest) {
    pendingRequest.status = 'cancelled';
  }
}

export function mockCreateCrew(rawName: string): CrewHomeResponse {
  const nameCheck = checkCrewName(rawName);
  if (!nameCheck.ok) {
    throw mockCrewError(400, 'invalid_name', nameCheck.message);
  }
  const lowered = nameCheck.name.toLowerCase();
  if (MOCK_BLOCKED_WORDS.some((word) => lowered.includes(word))) {
    throw mockCrewError(400, 'blocked_name', '쓸 수 없는 단어가 들어 있어요.');
  }
  if (openCrews().some((crew) => toNameKey(crew.name) === toNameKey(nameCheck.name))) {
    throw mockCrewError(409, 'name_taken', '이미 있는 이름이에요.');
  }
  if (findMyCrew()) {
    throw mockCrewError(409, 'already_in_crew', '이미 크루에 들어가 있어요.');
  }
  if (mockCrewState.createdCrewThisSession) {
    throw mockCrewError(409, 'create_limit', '크루는 30일에 한 번만 만들 수 있어요.');
  }
  if (mockCrewState.joinsLeftThisMonth <= 0) {
    throw mockCrewError(409, 'join_limit', '이번 달 크루 이동을 다 썼어요.');
  }

  const nowMs = Date.now();
  mockCrewState.crews.push({
    id: `crew-mock-${nowMs}`,
    name: nameCheck.name,
    inviteCode: randomInviteCode(),
    stars: 0,
    createdAt: new Date(nowMs).toISOString(),
    closed: false,
    bannedUserIds: [],
    members: [{
      userId: MOCK_ME_ID,
      name: myProfile.name,
      role: 'captain',
      contributionKm: 0,
      countsFrom: mockCountsFromIso(nowMs),
      countedFrom: null,
    }],
  });
  mockCrewState.joinsLeftThisMonth -= 1;
  mockCrewState.createdCrewThisSession = true;
  const pendingRequest = findMyPendingRequest();
  if (pendingRequest) {
    pendingRequest.status = 'cancelled';
  }

  return buildMockCrewHome();
}

export function mockJoinCrewByCode(rawCode: string): CrewHomeResponse {
  const code = normalizeCrewInviteCode(rawCode);
  const crew = isValidCrewInviteCode(code) ? openCrews().find((entry) => entry.inviteCode === code) : undefined;
  if (!crew) {
    throw mockCrewError(404, 'not_found', '크루를 찾지 못했어요.');
  }

  joinCrewAsMe(crew);
  return buildMockCrewHome();
}

export function mockRequestToJoinCrew(crewId: string): CrewHomeResponse {
  const crew = findOpenCrew(crewId);
  if (findMyCrew()) {
    throw mockCrewError(409, 'already_in_crew', '이미 크루에 들어가 있어요.');
  }
  if (findMyPendingRequest()) {
    throw mockCrewError(409, 'request_pending', '보내 둔 가입 신청이 있어요.');
  }
  if (crew.bannedUserIds.includes(MOCK_ME_ID)) {
    throw mockCrewError(403, 'crew_banned', '이 크루에는 30일 동안 다시 들어갈 수 없어요.');
  }
  if (crew.members.length >= CREW_MAX_MEMBERS) {
    throw mockCrewError(409, 'crew_full', '인원이 꽉 찼어요.');
  }

  mockCrewState.requests.push({
    requestId: `crew-request-${mockCrewState.nextRequestSeq}`,
    crewId: crew.id,
    userId: MOCK_ME_ID,
    name: myProfile.name,
    createdAt: new Date().toISOString(),
    status: 'pending',
  });
  mockCrewState.nextRequestSeq += 1;
  return buildMockCrewHome();
}

export function mockCancelCrewJoinRequest(requestId: string): CrewHomeResponse {
  const request = mockCrewState.requests.find((entry) => (
    entry.requestId === requestId && entry.userId === MOCK_ME_ID && entry.status === 'pending'
  ));
  if (!request) {
    throw mockCrewError(404, 'not_found', '신청을 찾지 못했어요.');
  }
  request.status = 'cancelled';
  return buildMockCrewHome();
}

function listPendingRequests(crewId: string): CrewRequestsResponse {
  const requests: CrewJoinRequestRow[] = mockCrewState.requests
    .filter((request) => request.crewId === crewId && request.status === 'pending')
    .map(({ requestId, userId, name, createdAt }) => ({ requestId, userId, name, createdAt }));
  return { requests };
}

export function mockFetchCrewJoinRequests(crewId: string): CrewRequestsResponse {
  requireCaptainOf(crewId);
  return listPendingRequests(crewId);
}

export function mockDecideCrewJoinRequest(requestId: string, approve: boolean): CrewRequestsResponse {
  const request = mockCrewState.requests.find((entry) => entry.requestId === requestId && entry.status === 'pending');
  if (!request) {
    throw mockCrewError(404, 'not_found', '신청을 찾지 못했어요.');
  }
  const crew = requireCaptainOf(request.crewId);

  if (approve) {
    if (crew.members.length >= CREW_MAX_MEMBERS) {
      throw mockCrewError(409, 'crew_full', '인원이 꽉 찼어요.');
    }
    const nowMs = Date.now();
    const countsFrom = mockCountsFromIso(nowMs);
    crew.members.push({
      userId: request.userId,
      name: request.name,
      role: 'member',
      contributionKm: 0,
      countsFrom,
      countedFrom: isMockPreseason(kstMonthKey(nowMs))
        ? null
        : new Date(Date.parse(countsFrom) + 7 * DAY_MS).toISOString(),
    });
  }

  request.status = approve ? 'approved' : 'rejected';
  return listPendingRequests(crew.id);
}

export function mockLeaveCrew(crewId: string): CrewHomeResponse {
  const crew = findOpenCrew(crewId);
  const me = crew.members.find((member) => member.userId === MOCK_ME_ID);
  if (!me) {
    throw mockCrewError(403, 'not_member', '이 크루의 멤버가 아니에요.');
  }

  crew.members = crew.members.filter((member) => member.userId !== MOCK_ME_ID);

  if (crew.members.length === 0) {
    crew.closed = true;
  } else if (me.role === 'captain') {
    // 캡틴이 나가면 기록 인정이 가장 이른 멤버에게 넘어간다.
    const heir = [...crew.members].sort((left, right) => Date.parse(left.countsFrom) - Date.parse(right.countsFrom))[0];
    heir.role = 'captain';
  }

  return buildMockCrewHome();
}

export function mockKickCrewMember(crewId: string, userId: string): CrewHomeResponse {
  const crew = requireCaptainOf(crewId);
  if (!crew.members.some((member) => member.userId === userId) || userId === MOCK_ME_ID) {
    throw mockCrewError(404, 'not_member', '이 크루의 멤버가 아니에요.');
  }
  crew.members = crew.members.filter((member) => member.userId !== userId);
  crew.bannedUserIds.push(userId);
  return buildMockCrewHome();
}

export function mockTransferCrewCaptain(crewId: string, userId: string): CrewHomeResponse {
  const crew = requireCaptainOf(crewId);
  const heir = crew.members.find((member) => member.userId === userId);
  if (!heir || userId === MOCK_ME_ID) {
    throw mockCrewError(404, 'not_member', '이 크루의 멤버가 아니에요.');
  }
  for (const member of crew.members) {
    member.role = member.userId === userId ? 'captain' : 'member';
  }
  return buildMockCrewHome();
}

export function mockRotateCrewInviteCode(crewId: string): CrewHomeResponse {
  const crew = requireCaptainOf(crewId);
  let code = randomInviteCode();
  while (mockCrewState.crews.some((entry) => entry.inviteCode === code)) {
    code = randomInviteCode();
  }
  crew.inviteCode = code;
  return buildMockCrewHome();
}
