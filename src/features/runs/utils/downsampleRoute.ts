import type { RunRoutePoint } from '@/domain';

// The GPS route uploaded with a saved run can have thousands of fixes (a 40-min run is already
// several thousand points; a marathon ~6x more). The serialized body then blows past the
// backend's MAX_BODY_SIZE_KB limit and the save fails with a 413. The route is only used to
// draw the 기록상세 map polyline, so we decimate it to a bounded number of points before upload.
//
// CRITICAL: this only shrinks the *displayed* polyline. The run's distanceKm / pace /
// durationSeconds / elevationGainM / cadenceSpm are computed live during the run and sent as
// their own payload fields; the backend never derives distance from the route (it only validates
// coordinates). So decimating the route never changes the recorded stats.
export const MAX_SAVED_ROUTE_POINTS = 1500;

// Decimate a route to at most MAX_SAVED_ROUTE_POINTS points while preserving order and shape:
// - always keep the first and last point (the map line must start/end where the run did),
// - sample evenly in between using a fixed stride (stride = ceil(length / maxPoints)).
// A route already at or under the limit is returned unchanged (same array reference).
export function downsampleRoute(
  route: RunRoutePoint[],
  maxPoints: number = MAX_SAVED_ROUTE_POINTS,
): RunRoutePoint[] {
  if (!Array.isArray(route) || route.length <= maxPoints || maxPoints < 2) {
    return route;
  }

  const lastIndex = route.length - 1;
  const sampled: RunRoutePoint[] = [];

  // Reserve one slot for the forced last point, then evenly sample the head [0, lastIndex)
  // into the remaining (maxPoints - 1) slots. Striding over the head with this budget keeps
  // the head count <= maxPoints - 1, so head + last <= maxPoints — never exceeding the cap.
  const headBudget = maxPoints - 1;
  const stride = Math.ceil(lastIndex / headBudget);

  // Always keep the first point, then every `stride`-th point — order is preserved.
  for (let index = 0; index < lastIndex; index += stride) {
    sampled.push(route[index]);
  }

  // Always keep the last point so the polyline ends exactly where the run did.
  sampled.push(route[lastIndex]);

  return sampled;
}
