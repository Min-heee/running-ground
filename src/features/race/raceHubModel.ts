import type { OfflineRaceEvent } from '@/domain/match';

// 레이스 탭의 순수 표시/행동 판정. 화면은 이 모델의 출력만 그린다 — 저장소 관례(코어 추출)대로
// 시간·상태 로직을 노드 테스트로 고정하기 위해 분리했다.

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

// 행사 시작 알림은 출발 10분 전 — 신청 시 기기에 DATE 예약되어 화면이 꺼져 있어도 OS가 배달한다.
export const RACE_REMINDER_BEFORE_START_MS = 10 * 60 * 1000;

function toValidMs(value: string | null | undefined): number | null {
  const ms = Date.parse(value ?? '');
  return Number.isFinite(ms) ? ms : null;
}

// "8월 15일 (금) 20:15" — 기기 로컬 시간대 기준(한국 유저 = KST).
export function formatRaceStartLabel(startsAt: string | null | undefined): string {
  const ms = toValidMs(startsAt);

  if (ms === null) {
    return '일정 미정';
  }

  const date = new Date(ms);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAY_LABELS[date.getDay()]}) ${hours}:${minutes}`;
}

// 달력일 기준 D-day. 시작일 당일은 D-DAY, 지났으면 null(라벨 숨김).
export function buildRaceDdayLabel(startsAt: string | null | undefined, nowMs: number): string | null {
  const startMs = toValidMs(startsAt);

  if (startMs === null) {
    return null;
  }

  const startDate = new Date(startMs);
  const nowDate = new Date(nowMs);
  const startDayMs = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()).getTime();
  const nowDayMs = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();
  const dayDiff = Math.round((startDayMs - nowDayMs) / DAY_MS);

  if (dayDiff > 0) {
    return `D-${dayDiff}`;
  }

  if (dayDiff === 0) {
    return 'D-DAY';
  }

  return null;
}

export type RaceJoinAction = {
  kind: 'join' | 'cancel' | 'closed' | 'full' | 'live' | 'finished';
  label: string;
  disabled: boolean;
};

// 신청 버튼의 단일 진실. 서버 status가 우선하고, 그 다음이 정원/신청 여부다.
export function resolveRaceJoinAction(event: Pick<OfflineRaceEvent, 'status' | 'registered' | 'participantCount' | 'capacity'>): RaceJoinAction {
  if (event.status === 'finished') {
    return { kind: 'finished', label: '종료된 레이스', disabled: true };
  }

  if (event.status === 'live') {
    return { kind: 'live', label: '진행 중', disabled: true };
  }

  if (event.registered) {
    // 신청 취소는 마감 전까지만 — 마감 후엔 편성이 돌기 때문에 서버도 거절한다.
    const cancellable = event.status === 'registration_open' || event.status === 'registration_closing';
    return cancellable
      ? { kind: 'cancel', label: '신청 취소', disabled: false }
      : { kind: 'closed', label: '신청 완료 — 곧 시작해요', disabled: true };
  }

  if (event.status === 'registration_closed') {
    return { kind: 'closed', label: '신청 마감', disabled: true };
  }

  if (event.capacity > 0 && event.participantCount >= event.capacity) {
    return { kind: 'full', label: '정원 마감', disabled: true };
  }

  return { kind: 'join', label: '참가 신청', disabled: false };
}

// 알림 예약 시각. 시작이 이미 10분 이내로 다가왔으면 예약하지 않는다(과거 트리거 방지).
export function resolveRaceReminderAtMs(startsAt: string | null | undefined, nowMs: number): number | null {
  const startMs = toValidMs(startsAt);

  if (startMs === null) {
    return null;
  }

  const reminderAtMs = startMs - RACE_REMINDER_BEFORE_START_MS;
  return reminderAtMs > nowMs ? reminderAtMs : null;
}

// 아레나 자동 핸드오프 대상 (815 리허설 2026-08-11: 카운트다운이 0이 돼도 화면이 레이스/홈에
// 머물렀다). 신청했고 편성이 끝난(formedMatchId) 이벤트 중 출발이 가장 임박한 것 하나 —
// 화면은 이 대상을 예약 방과 동일한 핸드오프 훅(≤25s에 러닝 탭 교체 진입)에 그대로 물린다.
// 출발이 이미 지난 이벤트는 대상이 아니다(러닝 탭의 active 복원 경로가 맡는다).
export function resolveRaceArenaHandoffTarget(
  events: OfflineRaceEvent[],
  nowMs: number,
): { matchId: string; distanceKm: number; slotStartAt: string; remainingSeconds: number } | null {
  const candidates = events
    .filter((event) => event.registered && typeof event.formedMatchId === 'string' && event.formedMatchId)
    .map((event) => {
      const startMs = toValidMs(event.startsAt);
      return startMs === null || startMs <= nowMs
        ? null
        : {
          matchId: event.formedMatchId as string,
          distanceKm: event.distanceKm,
          slotStartAt: event.startsAt,
          remainingSeconds: Math.max(1, Math.round((startMs - nowMs) / 1000)),
        };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((left, right) => left.remainingSeconds - right.remainingSeconds);

  return candidates[0] ?? null;
}

// 편성 재조회 판정 (적대 검증 2026-08-11): 레이스 탭은 포커스 때만 허브를 불러오므로, 마감
// 전부터 탭을 켜두고 기다리는 유저는 편성(formedMatchId)을 영영 모른 채 핸드오프 창을
// 지나친다. 신청한 이벤트가 아직 미편성인데 출발이 임박(3분 전 ~ 출발 후 10분: 서버 편성
// 유예와 같은 창)하면 true — 화면은 스로틀(20초)을 걸고 허브를 재조회한다. 허브 GET은 서버
// 편성 스윕도 돌리므로, 혼자 기다리는 클라이언트도 이 재조회로 편성을 스스로 촉발한다.
export const RACE_FORMATION_REFETCH_BEFORE_MS = 3 * 60 * 1000;
export const RACE_FORMATION_REFETCH_AFTER_MS = 10 * 60 * 1000;

export function shouldRefetchForRaceFormation(events: OfflineRaceEvent[], nowMs: number): boolean {
  return events.some((event) => {
    if (!event.registered || event.formedMatchId) {
      return false;
    }

    const startMs = toValidMs(event.startsAt);

    if (startMs === null) {
      return false;
    }

    return nowMs >= startMs - RACE_FORMATION_REFETCH_BEFORE_MS
      && nowMs <= startMs + RACE_FORMATION_REFETCH_AFTER_MS;
  });
}
