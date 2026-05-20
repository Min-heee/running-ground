import type { RunningMatchRoom } from '@/lib/api/types';
import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';

export type LiveMatchRouteHydration = {
  distanceKm?: number;
  hydratedAtMs: number;
  matchId: string;
  mode: Extract<RunMatchMode, 'duel' | 'group'>;
  nonce: string;
  preferArena?: boolean;
  room?: RunningMatchRoom;
  roomId?: string | null;
  slotStartAt?: string;
  source?: string;
};

export type HydrateLiveMatchRouteStateInput = {
  distanceKm?: number | null;
  matchId?: string | null;
  mode?: RunMatchMode | null;
  preferArena?: boolean;
  room?: RunningMatchRoom | null;
  roomId?: string | null;
  slotStartAt?: string | null;
  source?: string;
};

const LIVE_MATCH_ROUTE_HYDRATION_TTL_MS = 10 * 60 * 1000;

let hydratedRouteState: LiveMatchRouteHydration | null = null;

function isCompetitiveMode(mode: RunMatchMode | null | undefined): mode is Extract<RunMatchMode, 'duel' | 'group'> {
  return mode === 'duel' || mode === 'group';
}

export function hydrateLiveMatchRouteState({
  distanceKm,
  matchId,
  mode,
  preferArena,
  room,
  roomId,
  slotStartAt,
  source,
}: HydrateLiveMatchRouteStateInput): LiveMatchRouteHydration | null {
  if (!matchId || !isCompetitiveMode(mode)) {
    return null;
  }

  hydratedRouteState = {
    distanceKm: typeof distanceKm === 'number' && Number.isFinite(distanceKm) ? distanceKm : undefined,
    hydratedAtMs: Date.now(),
    matchId,
    mode,
    nonce: `hydrated-${Date.now()}`,
    preferArena,
    room: room ?? undefined,
    roomId: roomId ?? null,
    slotStartAt: slotStartAt ?? undefined,
    source,
  };

  return hydratedRouteState;
}

export function getLiveMatchRouteHydration(nowMs = Date.now()): LiveMatchRouteHydration | null {
  if (!hydratedRouteState) {
    return null;
  }

  if (nowMs - hydratedRouteState.hydratedAtMs > LIVE_MATCH_ROUTE_HYDRATION_TTL_MS) {
    hydratedRouteState = null;
    return null;
  }

  return hydratedRouteState;
}

export function clearLiveMatchRouteHydration(matchId?: string | null) {
  if (!matchId || hydratedRouteState?.matchId === matchId) {
    hydratedRouteState = null;
  }
}
