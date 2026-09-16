import type { MyRunRecord } from '@/domain';
import { formatDistanceValue } from '@/utils/formatUnits';
import { parsePaceSecondsPerKm, resolveRunDurationSeconds } from '@/utils/runDuration';

// 기록 탭의 달 묶음 (오너 2026-09-14). 연·월 드롭다운을 걷어낸 자리를 이게 대신한다 —
// 화면은 한 줄기로 이어지고, 달이 바뀌는 자리에만 머리글이 선다.
// RN 미의존 순수 함수: 라벨 생성 규칙이 화면과 여기 두 군데 살면 해 넘김 분기가 어긋난다.

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export type ActivityMonthGroup = {
  // 'YYYY-MM'
  key: string;
  // '이번 달' | '8월' | '2025년 12월'
  label: string;
  // '61.0km · 12회' — 이번 달도 같은 꼴 (큰 숫자는 위 기간 블록이 맡는다)
  metaLine: string;
  isCurrentMonth: boolean;
  // 서버 순서(compareRunsLatestFirst) 그대로 — 절대 재정렬하지 않는다.
  runs: MyRunRecord[];
  distanceKm: number;
  runCount: number;
};

function toMonthKey(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function roundDistance(value: number) {
  return Math.round(value * 10) / 10;
}

function formatPaceLabel(secondsPerKm: number) {
  const total = Math.round(secondsPerKm);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}/km`;
}

// 거리 가중 평균 페이스. 기권·정지 저장 기록의 '00:00/km'와 측정 불가의 '--:--/km'는
// parsePaceSecondsPerKm가 null을 주므로 분자·분모 양쪽에서 빠진다(회수·거리에는 남는다).
// 기간 블록(ActivityPeriodBlock)의 히어로 메타가 같은 규칙을 쓴다.
export function buildAveragePaceLabel(runs: readonly MyRunRecord[]): string | null {
  let seconds = 0;
  let distanceKm = 0;

  for (const run of runs) {
    if (parsePaceSecondsPerKm(run.pace) === null) {
      continue;
    }

    const duration = resolveRunDurationSeconds(run);

    if (duration === null || !(run.distanceKm > 0)) {
      continue;
    }

    seconds += duration;
    distanceKm += run.distanceKm;
  }

  return distanceKm > 0 ? formatPaceLabel(seconds / distanceKm) : null;
}

function buildLabel(key: string, isCurrentMonth: boolean, currentYear: number) {
  if (isCurrentMonth) {
    return '이번 달';
  }

  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));

  return year === currentYear ? `${month}월` : `${year}년 ${month}월`;
}

export function buildActivityMonthGroups(
  runs: readonly MyRunRecord[],
  nowMs: number,
): ActivityMonthGroup[] {
  const now = new Date(nowMs);
  const currentKey = toMonthKey(now.getFullYear(), now.getMonth());
  const currentYear = now.getFullYear();
  const buckets = new Map<string, MyRunRecord[]>();

  for (const run of runs) {
    const key = (run.date ?? '').slice(0, 7);

    if (key.length !== 7) {
      continue;
    }

    const bucket = buckets.get(key);

    if (bucket) {
      bucket.push(run);
      continue;
    }

    buckets.set(key, [run]);
  }

  const keys = Array.from(buckets.keys());

  // 이번 달에 기록이 없어도 히어로는 서야 한다 — 없으면 제자리에 빈 그룹을 끼운다
  // (미래 날짜 수동 기록이 있어도 순서가 안 깨지도록 키 문자열로 위치를 찾는다).
  if (!buckets.has(currentKey)) {
    const insertAt = keys.findIndex((key) => key < currentKey);
    keys.splice(insertAt === -1 ? keys.length : insertAt, 0, currentKey);
  }

  return keys.map((key) => {
    const groupRuns = buckets.get(key) ?? [];
    const isCurrentMonth = key === currentKey;
    const distanceKm = roundDistance(groupRuns.reduce((sum, run) => sum + (run.distanceKm ?? 0), 0));
    const runCount = groupRuns.length;

    return {
      key,
      label: buildLabel(key, isCurrentMonth, currentYear),
      metaLine: `${formatDistanceValue(distanceKm)}km · ${runCount}회`,
      isCurrentMonth,
      runs: groupRuns,
      distanceKm,
      runCount,
    };
  });
}

// 달은 머리글이 이미 말했으니 행에는 '일'만. 'YYYY-MM-DD'만 넘기면 UTC로 파싱돼
// KST에서 하루 밀리므로 시각을 붙여 로컬로 읽는다.
export function formatActivityRunDayLabel(date: string): string {
  const day = Number((date ?? '').slice(8, 10));

  if (!Number.isFinite(day) || day <= 0) {
    return '';
  }

  const parsed = new Date(`${date}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return `${day}일`;
  }

  return `${day}일 (${WEEKDAY_LABELS[parsed.getDay()]})`;
}
