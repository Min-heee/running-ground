# Codebase Refactor Plan

RunningGround has moved quickly from prototype to real-device QA. The next refactor should be incremental and behavior-preserving, especially around party run and match tracking.

## Current Pain Points

- `src/features/runs/TrackRunExperience.tsx` owns too much: solo tracking, 1:1 matching, group matching, party run rooms, countdown, live arena, result saving, and UI rendering.
- `src/lib/api/services.ts` mixes API calls, mock fallbacks, mock state, and feature-specific request shaping in one large file.
- Route files in `app/` are mostly acceptable, but some route screens still contain feature logic that should live under `src/features/*`.
- Match state has many overlapping concepts: scheduled match, active match, room-linked match, countdown room, local tracking state, server official judgement.
- Backend routes are centralized enough for MVP, but match-room and running-match behavior should eventually be split into route modules/services.

## Target Frontend Structure

Use `app/` only as route entry points. Product behavior should live in `src/features/*`.

Recommended run feature layout:

- `src/features/runs/TrackRunExperience.tsx`
  - screen coordinator only
  - wires hooks, handlers, and presentational sections together
- `src/features/runs/tracking/`
  - GPS, pedometer, elapsed time, smoothing, save/discard tracking
- `src/features/runs/matches/`
  - 1:1/group match lifecycle
  - match progress sync
  - result/forfeit handling
- `src/features/runs/rooms/`
  - party run room creation, invite, ready state, start countdown
- `src/features/runs/components/`
  - running tab cards, room lobby sections, tracking status cards
- `src/components/matches/`
  - reusable visual-only arena/board/countdown components

## Target API Structure

Split `src/lib/api/services.ts` by product area, then re-export from one barrel file so screens do not churn all at once.

- `src/lib/api/services/auth.ts`
- `src/lib/api/services/runs.ts`
- `src/lib/api/services/matches.ts`
- `src/lib/api/services/rooms.ts`
- `src/lib/api/services/friends.ts`
- `src/lib/api/services/league.ts`
- `src/lib/api/services/market.ts`
- `src/lib/api/services/integrations.ts`
- `src/lib/api/services/index.ts`

Mock-only builders should move to `src/lib/api/mock/*` so real API code stays readable.

## Safe Refactor Order

1. Extract pure helpers first.
   - No UI change.
   - Easy to test with `npm run typecheck`.
   - Example done: match scheduling helpers moved to `src/features/runs/matchScheduling.ts`.
   - Example done: match progress helpers moved to `src/features/runs/matchProgress.ts`.
   - Example done: tracking session helpers moved to `src/features/runs/trackingSession.ts`.

2. Extract presentational sections from `TrackRunExperience`.
   - Keep state in the parent first.
   - Pass props down.
   - Avoid changing behavior while moving JSX.
   - Example done: running metrics grid moved to `src/features/runs/components/RunningMetricGrid.tsx`.
   - Example done: party run invite card moved to `src/features/runs/components/PartyRunInviteCard.tsx`.
   - Example done: upcoming match list moved to `src/features/runs/components/UpcomingMatchList.tsx`.
   - Example done: match option selector moved to `src/features/runs/components/MatchOptionSelector.tsx`.
   - Example done: match result panel moved to `src/features/runs/components/MatchResultPanel.tsx`.

3. Extract hooks after the UI is split.
   - `useRunTracking`
   - `useMatchLifecycle`
   - `usePartyRunRoom`
   - `useMatchProgressSync`

4. Split API services.
   - First create smaller files and re-export the same function names.
   - Only after that should call sites be moved to feature-specific imports.

5. Split backend match logic.
   - Do this after frontend QA stabilizes.
   - Match-room and running-match official judgement should be the first backend split.

## Guardrails

- Do not refactor party run countdown and tracking logic in the same commit.
- Do not change API response shapes during file moves.
- Keep commits small enough to rollback.
- Run `npm run typecheck`, `npm run lint -- --quiet`, and `git diff --check` after each refactor slice.
- If a refactor touches live match progress, test iOS/iOS and iOS/Android party run before shipping.
