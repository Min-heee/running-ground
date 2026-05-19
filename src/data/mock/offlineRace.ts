import type { OfflineRaceEvent, OfflineRaceHub, OfflineRaceParticipantPreview } from '@/domain';

function addHours(base: Date, hours: number) {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

function addDays(base: Date, days: number) {
  return addHours(base, days * 24);
}

function setRaceStart(base: Date, dayOffset: number, hour: number, minute = 0) {
  const next = new Date(base);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + dayOffset);
  next.setHours(hour, minute, 0, 0);
  return next;
}

const offlineRacePreview: OfflineRaceParticipantPreview[] = [
  { id: 'orp-1', name: '김관우', paceGoal: '4:55/km', regionLabel: '강남구' },
  { id: 'orp-2', name: '박지훈', paceGoal: '5:10/km', regionLabel: '송파구' },
  { id: 'orp-3', name: '최민준', paceGoal: '5:28/km', regionLabel: '성동구' },
  { id: 'orp-4', name: '한예린', paceGoal: '5:35/km', regionLabel: '마포구' },
];

function createRaceOption(input: {
  id: string;
  title: string;
  subtitle: string;
  distanceKm: number;
  startsAt: Date;
  participantCount: number;
  capacity: number;
  entryFeePoints: number;
  hostLabel: string;
  participationMode?: string;
  proofMethod?: string;
  runWindowMinutes?: number;
  operationNote?: string;
  participantPreview?: OfflineRaceParticipantPreview[];
}): OfflineRaceEvent {
  return {
    id: input.id,
    title: input.title,
    subtitle: input.subtitle,
    distanceKm: input.distanceKm,
    startsAt: input.startsAt.toISOString(),
    registrationClosesAt: addHours(input.startsAt, -1).toISOString(),
    participationMode: input.participationMode ?? '각자 원하는 코스에서 동시 출발',
    proofMethod: input.proofMethod ?? '러닝 앱 연동 후 자동 집계',
    runWindowMinutes: input.runWindowMinutes ?? 20,
    hostLabel: input.hostLabel,
    participantCount: input.participantCount,
    capacity: input.capacity,
    entryFeePoints: input.entryFeePoints,
    operationNote: input.operationNote ?? '출발 시각 기준 허용 시간 안에 시작한 기록만 같은 회차로 반영해.',
    registered: false,
    status: 'registration_open',
    participantPreview: input.participantPreview ?? offlineRacePreview,
  };
}

export function createOfflineRaceHubMock(now = new Date()): OfflineRaceHub {
  const featuredStartsAt = setRaceStart(now, 1, 18, 0);
  const firstNightStartsAt = setRaceStart(now, 1, 20, 0);
  const secondMorningStartsAt = setRaceStart(now, 2, 7, 0);
  const secondEveningStartsAt = setRaceStart(now, 2, 19, 30);
  const thirdEveningStartsAt = setRaceStart(now, 3, 18, 30);
  const thirdNightStartsAt = setRaceStart(now, 3, 20, 30);

  return {
    featuredEvent: createRaceOption({
      id: 'offline-race-hangang-night-10k',
      title: '한강 나이트',
      subtitle: '퇴근 후 같은 시각에 각자 출발하는 대표 야간 레이스.',
      distanceKm: 10,
      startsAt: featuredStartsAt,
      participantCount: 42,
      capacity: 80,
      entryFeePoints: 20,
      hostLabel: 'Runnig Crew Live',
      proofMethod: '연동 기록 또는 수동 인증 업로드',
      operationNote: '출발 시각 기준 20분 안에 러닝을 시작하면 같은 회차로 인정해.',
    }),
    upcomingEvents: [
      createRaceOption({
        id: 'offline-race-hangang-night-5k',
        title: '한강 나이트',
        subtitle: '퇴근 후 같은 시각에 각자 출발하는 대표 야간 레이스.',
        distanceKm: 5,
        startsAt: featuredStartsAt,
        participantCount: 34,
        capacity: 60,
        entryFeePoints: 10,
        hostLabel: 'Runnig Crew Live',
        participantPreview: offlineRacePreview.slice(0, 3),
      }),
      createRaceOption({
        id: 'offline-race-hangang-night-15k',
        title: '한강 나이트',
        subtitle: '퇴근 후 같은 시각에 각자 출발하는 대표 야간 레이스.',
        distanceKm: 15,
        startsAt: featuredStartsAt,
        participantCount: 25,
        capacity: 50,
        entryFeePoints: 28,
        hostLabel: 'Runnig Crew Live',
        participantPreview: offlineRacePreview.slice(1),
      }),
      createRaceOption({
        id: 'offline-race-hangang-night-20k',
        title: '한강 나이트',
        subtitle: '퇴근 후 같은 시각에 각자 출발하는 대표 야간 레이스.',
        distanceKm: 20,
        startsAt: featuredStartsAt,
        participantCount: 14,
        capacity: 30,
        entryFeePoints: 36,
        hostLabel: 'Runnig Crew Live',
        runWindowMinutes: 25,
        participantPreview: offlineRacePreview.slice(2),
      }),
      createRaceOption({
        id: 'offline-race-city-tempo-3k',
        title: '도심 템포',
        subtitle: '저녁 시간에 템포를 끌어올리는 실시간 도심 러닝.',
        distanceKm: 3,
        startsAt: firstNightStartsAt,
        participantCount: 20,
        capacity: 40,
        entryFeePoints: 8,
        hostLabel: 'Night Tempo Crew',
        proofMethod: 'GPS 연동 기록 우선 인증',
        runWindowMinutes: 12,
      }),
      createRaceOption({
        id: 'offline-race-city-tempo-5k',
        title: '도심 템포',
        subtitle: '저녁 시간에 템포를 끌어올리는 실시간 도심 러닝.',
        distanceKm: 5,
        startsAt: firstNightStartsAt,
        participantCount: 31,
        capacity: 55,
        entryFeePoints: 12,
        hostLabel: 'Night Tempo Crew',
        proofMethod: 'GPS 연동 기록 우선 인증',
        runWindowMinutes: 15,
      }),
      createRaceOption({
        id: 'offline-race-city-tempo-10k',
        title: '도심 템포',
        subtitle: '저녁 시간에 템포를 끌어올리는 실시간 도심 러닝.',
        distanceKm: 10,
        startsAt: firstNightStartsAt,
        participantCount: 18,
        capacity: 35,
        entryFeePoints: 20,
        hostLabel: 'Night Tempo Crew',
        proofMethod: 'GPS 연동 기록 우선 인증',
        runWindowMinutes: 18,
      }),
      createRaceOption({
        id: 'offline-race-sunrise-run-5k',
        title: '선라이즈 런',
        subtitle: '아침 공기 속에서 함께 시작하는 새벽 러닝 세션.',
        distanceKm: 5,
        startsAt: secondMorningStartsAt,
        participantCount: 24,
        capacity: 50,
        entryFeePoints: 10,
        hostLabel: 'Morning Pacers',
        participantPreview: offlineRacePreview.slice(0, 2),
      }),
      createRaceOption({
        id: 'offline-race-sunrise-run-10k',
        title: '선라이즈 런',
        subtitle: '아침 공기 속에서 함께 시작하는 새벽 러닝 세션.',
        distanceKm: 10,
        startsAt: secondMorningStartsAt,
        participantCount: 28,
        capacity: 45,
        entryFeePoints: 18,
        hostLabel: 'Morning Pacers',
        participantPreview: offlineRacePreview.slice(1, 4),
      }),
      createRaceOption({
        id: 'offline-race-sunrise-run-15k',
        title: '선라이즈 런',
        subtitle: '아침 공기 속에서 함께 시작하는 새벽 러닝 세션.',
        distanceKm: 15,
        startsAt: secondMorningStartsAt,
        participantCount: 16,
        capacity: 32,
        entryFeePoints: 26,
        hostLabel: 'Morning Pacers',
        runWindowMinutes: 25,
        participantPreview: offlineRacePreview.slice(2),
      }),
      createRaceOption({
        id: 'offline-race-river-recovery-3k',
        title: '리버 리커버리',
        subtitle: '부담 없이 가볍게 뛰는 평일 저녁 회복 러닝.',
        distanceKm: 3,
        startsAt: secondEveningStartsAt,
        participantCount: 19,
        capacity: 45,
        entryFeePoints: 6,
        hostLabel: 'Easy Run Club',
        participationMode: '회복 페이스 동시 출발',
        proofMethod: 'GPS 연동 또는 수동 업로드',
        runWindowMinutes: 12,
      }),
      createRaceOption({
        id: 'offline-race-river-recovery-5k',
        title: '리버 리커버리',
        subtitle: '부담 없이 가볍게 뛰는 평일 저녁 회복 러닝.',
        distanceKm: 5,
        startsAt: secondEveningStartsAt,
        participantCount: 29,
        capacity: 60,
        entryFeePoints: 10,
        hostLabel: 'Easy Run Club',
        participationMode: '회복 페이스 동시 출발',
        proofMethod: 'GPS 연동 또는 수동 업로드',
        runWindowMinutes: 15,
      }),
      createRaceOption({
        id: 'offline-race-river-recovery-8k',
        title: '리버 리커버리',
        subtitle: '부담 없이 가볍게 뛰는 평일 저녁 회복 러닝.',
        distanceKm: 8,
        startsAt: secondEveningStartsAt,
        participantCount: 18,
        capacity: 36,
        entryFeePoints: 14,
        hostLabel: 'Easy Run Club',
        participationMode: '회복 페이스 동시 출발',
        proofMethod: 'GPS 연동 또는 수동 업로드',
        runWindowMinutes: 18,
      }),
      createRaceOption({
        id: 'offline-race-campus-loop-5k',
        title: '캠퍼스 루프',
        subtitle: '저녁 시간에 가볍게 몰입하는 캠퍼스 감성 루프 레이스.',
        distanceKm: 5,
        startsAt: thirdEveningStartsAt,
        participantCount: 21,
        capacity: 40,
        entryFeePoints: 10,
        hostLabel: 'Campus Run Club',
        proofMethod: '연동 기록 우선 인증',
      }),
      createRaceOption({
        id: 'offline-race-campus-loop-7k',
        title: '캠퍼스 루프',
        subtitle: '저녁 시간에 가볍게 몰입하는 캠퍼스 감성 루프 레이스.',
        distanceKm: 7,
        startsAt: thirdEveningStartsAt,
        participantCount: 26,
        capacity: 44,
        entryFeePoints: 14,
        hostLabel: 'Campus Run Club',
        proofMethod: '연동 기록 우선 인증',
      }),
      createRaceOption({
        id: 'offline-race-campus-loop-10k',
        title: '캠퍼스 루프',
        subtitle: '저녁 시간에 가볍게 몰입하는 캠퍼스 감성 루프 레이스.',
        distanceKm: 10,
        startsAt: thirdEveningStartsAt,
        participantCount: 17,
        capacity: 30,
        entryFeePoints: 20,
        hostLabel: 'Campus Run Club',
        proofMethod: '연동 기록 우선 인증',
        runWindowMinutes: 20,
      }),
      createRaceOption({
        id: 'offline-race-riverside-night-10k',
        title: '리버사이드 나이트',
        subtitle: '한밤의 강변 감각으로 달리는 장거리 실시간 레이스.',
        distanceKm: 10,
        startsAt: thirdNightStartsAt,
        participantCount: 18,
        capacity: 40,
        entryFeePoints: 20,
        hostLabel: 'River Long Crew',
        runWindowMinutes: 20,
      }),
      createRaceOption({
        id: 'offline-race-riverside-night-15k',
        title: '리버사이드 나이트',
        subtitle: '한밤의 강변 감각으로 달리는 장거리 실시간 레이스.',
        distanceKm: 15,
        startsAt: thirdNightStartsAt,
        participantCount: 12,
        capacity: 28,
        entryFeePoints: 28,
        hostLabel: 'River Long Crew',
        runWindowMinutes: 24,
      }),
      createRaceOption({
        id: 'offline-race-riverside-night-20k',
        title: '리버사이드 나이트',
        subtitle: '한밤의 강변 감각으로 달리는 장거리 실시간 레이스.',
        distanceKm: 20,
        startsAt: thirdNightStartsAt,
        participantCount: 8,
        capacity: 20,
        entryFeePoints: 36,
        hostLabel: 'River Long Crew',
        runWindowMinutes: 28,
      }),
    ],
    pastEvents: [
      {
        id: 'offline-race-river-loop',
        title: '리버 루프 8K',
        distanceKm: 8,
        finishedAt: addDays(now, -6).toISOString(),
        modeLabel: '각자 출발형',
        winnerName: '김관우',
        finishers: 33,
        summary: '시작 10분 전 알림과 자동 기록 연동 비율이 높아서 운영이 가장 안정적으로 끝났어.',
      },
      {
        id: 'offline-race-campus-run',
        title: '캠퍼스 다운힐 6K',
        distanceKm: 6,
        finishedAt: addDays(now, -13).toISOString(),
        modeLabel: '동시 출발형',
        winnerName: '민서윤',
        finishers: 24,
        summary: '출발 시각은 같게 유지하고, 다음 회차부터는 거리별 그룹 가이드를 더 세분화하기로 했어.',
      },
    ],
    guideSteps: [
      '시작 1시간 전까지 참가 신청을 받고 참가 인원을 확정해.',
      '정해진 시각에 각자 원하는 코스에서 출발하고, 허용 시간 안에 시작한 기록만 집계해.',
      '러닝 앱 연동 또는 수동 인증으로 완주를 확인하고 포인트를 즉시 정산해.',
    ],
  };
}
