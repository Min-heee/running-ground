import type { MyRunRecord } from '@/domain';

// Client mirror of backend/src/lib/competitiveRuns.mjs — the gate that decides
// whether a run can mint points or feed competitive surfaces. Imported runs
// (apple_health / health_connect / manual, or legacy records with no
// sourceType) are display-only: the server never awards them points, so every
// client surface that PROMISES points ("+10P", "이어가면 +NP") must compute
// from this filtered set or it promises points that will never arrive.
export function isCompetitiveRun(run: Pick<MyRunRecord, 'sourceType' | 'matchResult'>): boolean {
  if (run.matchResult) {
    return true;
  }

  return run.sourceType === 'runningground';
}

export function filterCompetitiveRuns<T extends Pick<MyRunRecord, 'sourceType' | 'matchResult'>>(
  runs: readonly T[],
): T[] {
  return runs.filter((run) => isCompetitiveRun(run));
}

function toFixed1(value: number) {
  return Number(value.toFixed(1));
}

function getWeekStart(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  const day = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - day);
  return next;
}

export type CompetitivePointBasis = {
  competitiveRuns: MyRunRecord[];
  lifetimeDistanceKm: number;
  weeklySummary: {
    totalDistanceKm: number;
    totalRuns: number;
    previousWeekDistanceKm: number;
  };
};

// The inputs the home point gauge needs, computed over competitive runs only
// with the same Monday week-start the backend uses (points.mjs getWeekStart),
// so the gauge's +P promises track what the server will actually mint.
export function buildCompetitivePointBasis(
  runs: readonly MyRunRecord[],
  currentDate: Date = new Date(),
): CompetitivePointBasis {
  const competitiveRuns = filterCompetitiveRuns(runs);
  const weekStart = getWeekStart(currentDate);
  const previousWeekStart = new Date(weekStart);
  previousWeekStart.setDate(weekStart.getDate() - 7);

  let lifetimeDistanceKm = 0;
  let totalDistanceKm = 0;
  let totalRuns = 0;
  let previousWeekDistanceKm = 0;

  for (const run of competitiveRuns) {
    lifetimeDistanceKm = toFixed1(lifetimeDistanceKm + run.distanceKm);
    const runDate = new Date(`${run.date}T00:00:00`);

    if (runDate >= weekStart) {
      totalDistanceKm = toFixed1(totalDistanceKm + run.distanceKm);
      totalRuns += 1;
    } else if (runDate >= previousWeekStart) {
      previousWeekDistanceKm = toFixed1(previousWeekDistanceKm + run.distanceKm);
    }
  }

  return {
    competitiveRuns,
    lifetimeDistanceKm,
    weeklySummary: { totalDistanceKm, totalRuns, previousWeekDistanceKm },
  };
}
