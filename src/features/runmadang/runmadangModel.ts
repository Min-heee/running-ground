// 그라운드 표시/생성 모델 — RN 무의존 순수 함수 (node 테스트 러너 호환).

import type { RunmadangChallenge, RunmadangMetric } from '@/lib/api/types/runmadang';

export const RUNMADANG_METRIC_ITEMS = [
  { id: 'distance', label: '거리' },
  { id: 'duration', label: '시간' },
] as const;

export const RUNMADANG_PERIOD_PRESET_ITEMS = [
  { id: '3d', label: '3일' },
  { id: '1w', label: '1주일' },
  { id: '2w', label: '2주' },
  { id: '1m', label: '1개월' },
  { id: 'custom', label: '직접 지정' },
] as const;

export const RUNMADANG_STAKE_PRESETS = [0, 50, 100, 300] as const;

const KST_DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const KST_WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function toKstParts(ms: number) {
  const shifted = new Date(ms + KST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: KST_WEEKDAY_LABELS[shifted.getUTCDay()],
  };
}

export function formatKstDayKey(ms: number): string {
  const { year, month, day } = toKstParts(ms);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// 올해가 아닌 날짜는 연도를 붙인다 — 연도 없이 '8.7 (금)'만 보이면 몇 년 뒤 시작
// 판을 다음 주로 오인할 수 있다 (적대 리뷰).
export function formatKstDayLabel(ms: number, nowMs: number = Date.now()): string {
  const { year, month, day, weekday } = toKstParts(ms);
  const currentYear = toKstParts(nowMs).year;
  const yearPrefix = year === currentYear ? '' : `${year}.`;
  return `${yearPrefix}${month}.${day} (${weekday})`;
}

// '8.7 (금) ~ 8.13 (목)'. endAt은 배타 경계(다음날 00:00 KST)라 하루 빼서 표시한다.
export function formatRunmadangPeriod(startAt: string, endAt: string, nowMs: number = Date.now()): string {
  const startMs = Date.parse(startAt);
  const endMs = Date.parse(endAt) - 1;
  return `${formatKstDayLabel(startMs, nowMs)} ~ ${formatKstDayLabel(endMs, nowMs)}`;
}

export function formatRunmadangRemaining(endAt: string, nowMs: number): string {
  const remainingMs = Date.parse(endAt) - nowMs;
  if (remainingMs <= 0) {
    return '종료';
  }
  if (remainingMs < 60 * 60 * 1000) {
    return `${Math.max(1, Math.floor(remainingMs / (60 * 1000)))}분 남음`;
  }
  if (remainingMs < KST_DAY_MS) {
    return `${Math.floor(remainingMs / (60 * 60 * 1000))}시간 남음`;
  }
  return `${Math.floor(remainingMs / KST_DAY_MS)}일 남음`;
}

// distance → '5.39km', duration → '1시간 24분' / '45분' / '30초'.
export function formatRunmadangValue(metric: RunmadangMetric, value: number): string {
  if (metric === 'distance') {
    return `${(Math.round(value * 100) / 100).toFixed(2)}km`;
  }

  const totalSeconds = Math.max(0, Math.round(value));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
  }
  if (minutes > 0) {
    return `${minutes}분`;
  }
  return `${totalSeconds}초`;
}

export type RunmadangDateOption = { key: string; label: string };

// 직접 지정용 날짜 후보: 내일부터 30일 (백엔드 규칙과 동일 — 오늘 시작은 프리셋으로).
export function buildRunmadangStartDateOptions(nowMs: number): RunmadangDateOption[] {
  return Array.from({ length: 30 }, (_, index) => {
    const ms = nowMs + (index + 1) * KST_DAY_MS;
    return { key: formatKstDayKey(ms), label: formatKstDayLabel(ms) };
  });
}

// 종료일 후보: 시작일 당일(하루짜리)부터 최대 31일.
export function buildRunmadangEndDateOptions(startDateKey: string): RunmadangDateOption[] {
  const startMs = Date.parse(`${startDateKey}T00:00:00+09:00`);
  return Array.from({ length: 31 }, (_, index) => {
    const ms = startMs + index * KST_DAY_MS;
    return { key: formatKstDayKey(ms), label: formatKstDayLabel(ms) };
  });
}

// 시작일을 다시 고를 때 기존 종료일을 새 31일 창에 맞춘다: 시작일보다 이르면 시작일로
// 끌어오고, 창을 넘으면 null(다시 선택) — 화면엔 '선택'인데 서버로는 낡은 값이 나가는
// 모순을 막는다 (적대 리뷰).
export function clampRunmadangEndDate(startDateKey: string, endDateKey: string | null): string | null {
  if (!endDateKey) {
    return null;
  }
  if (endDateKey < startDateKey) {
    return startDateKey;
  }
  const startMs = Date.parse(`${startDateKey}T00:00:00+09:00`);
  const maxKey = formatKstDayKey(startMs + 30 * KST_DAY_MS);
  return endDateKey > maxKey ? null : endDateKey;
}

export type RunmadangSections = {
  invited: RunmadangChallenge[];
  active: RunmadangChallenge[];
  closed: RunmadangChallenge[];
};

// 목록 3분할: 초대받은 판 / 내가 참가한 진행 판 / 끝난 판.
export function splitRunmadangSections(challenges: RunmadangChallenge[]): RunmadangSections {
  const invited: RunmadangChallenge[] = [];
  const active: RunmadangChallenge[] = [];
  const closed: RunmadangChallenge[] = [];

  for (const challenge of challenges) {
    if (challenge.status === 'settled' || challenge.status === 'cancelled' || challenge.status === 'finished') {
      if (challenge.myRole === 'host' || challenge.myRole === 'participant') {
        closed.push(challenge);
      }
      continue;
    }
    if (challenge.myRole === 'invited') {
      invited.push(challenge);
      continue;
    }
    if (challenge.myRole === 'host' || challenge.myRole === 'participant') {
      active.push(challenge);
    }
  }

  return { invited, active, closed };
}

export function buildRunmadangResultLine(challenge: RunmadangChallenge): string | null {
  if (challenge.status === 'cancelled') {
    return '취소됨 · 판돈 환불';
  }
  if (challenge.status === 'finished') {
    return '기간 종료 · 정산 준비 중';
  }
  if (challenge.status !== 'settled') {
    return null;
  }
  if (challenge.resultTone === 'void') {
    return '무효 · 판돈 환불';
  }

  const winners = challenge.standings.filter((row) => challenge.winnerUserIds?.includes(row.userId));
  const iWon = winners.some((row) => row.isMe);
  const winnerNames = winners.map((row) => row.name).join(', ');
  const winnerCount = challenge.winnerUserIds?.length ?? winners.length;

  if (iWon) {
    // 동률 분배 반영 실수령액 — pot 전액을 표시하면 잔액과 안 맞는다. 구서버 폴백은 pot.
    const payout = challenge.myPayoutPoints ?? challenge.potPoints;
    return winnerCount > 1 ? `공동 우승! +${payout}P` : `내가 우승! +${payout}P`;
  }
  if (!winnerNames) {
    return '정산 완료';
  }
  if (winnerCount > 1) {
    return `${winnerNames} 공동 우승 · 각 ${Math.floor(challenge.potPoints / winnerCount)}P`;
  }
  return `${winnerNames} 우승 · ${challenge.potPoints}P`;
}
