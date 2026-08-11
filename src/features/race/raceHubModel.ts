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
