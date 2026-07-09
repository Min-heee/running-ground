# Party-room 1:1 opponent sync frozen at 측정대기 0.00 — ROOT (2026-07-09)

## Symptom
Party-room 1:1 duel, both phones screen-on: each phone's OWN progress advances, but the
opponent is pinned at "측정 대기" 0.00km the whole run (bidirectional). The arena stays on the
room-linked PLACEHOLDER ("대결 정보를 맞추는 중") and never promotes to the official duel —
`effectiveDuelOpponent` is null because the polled `duelMatchStatus` carries no opponent progress.

## Root cause: PUSH-death via the dual-mount heartbeat-slot latch (RECEIVE-side symptom, PUSH-side cause)
Not association (both runners ARE in one shared session, both poll it correctly). The opponent
row reads `liveStatus:'ready'` / `liveUpdatedAt:null` because **neither phone's own progress POST
ever mutates its own row** — the foreground push is gated out.

- `TrackRunExperience` is mounted TWICE: the tab (`RunningScreen.tsx`) and the stack
  (`TrackRunScreen.tsx`). The heartbeat/poll registries are module-level singletons
  (`rgHeartbeatRegistry.ts:10`, `rgPollingRegistry.ts`).
- During the tab→stack overlap the redundant (tab) instance acquires the module-level key
  `match-progress:<matchId>`. `freezeOnBlur` then freezes the tab's React tree, so its heartbeat
  effect cleanup (release) never runs → it holds the slot for the whole run.
- The visible (stack) instance's `canSendMatchProgressHeartbeat` → `canUseRgHeartbeatSlot(key,
  ownerId)` returns false (key owned by the zombie) → every foreground push skipped as
  `reason:'duplicate-heartbeat-owner'` (useMatchProgressSync.ts). MY server elapsed stays 0.
- Symmetric on both phones → bidirectional freeze.
- The steal escape hatch (04d11d7d) does not reliably reclaim here: it keys off the module-global
  `lastHeartbeatAtMs`, which can stay fresh from any instance, so `isViableSender`/stall never
  greenlights the steal.

## Why party-room 1:1 specifically (queue-matched duel worked)
1. The direct status poll is DISABLED for party rooms (`matchLifecycleController.ts:397-398`,
   `source !== 'party-room'`). A queue duel keeps a second independently-keyed delivery channel
   (`blocking-match-status:<id>`) repopulating `duelMatchStatus.opponent`; a party duel relies on
   the linked poll + the heartbeat response, so a dead push removes proportionally more redundancy.
2. Checkpoint-fair display: the opponent's shown distance is clamped to the common checkpoint =
   min(participants' server elapsed). If MY push dies, MY server elapsed is 0 → common checkpoint
   pinned at 0 → the opponent's DISPLAYED distance pinned at 0.00 even if a stray GET carried a
   fresh row. (Amplifier, not the root.)

## NOT a regression from recent commits
checkpoint-fair f285088 = display only; finish-flow FIX-B 109c2da = fewer teardowns; retention
55d0d8f = all-done only. The dual-mount zombie root has been a disclosed residual since the latch
saga ([[opponent-early-0km-open]] 4차/5차: "silent LIVE holder / 유령 인스턴스 중복 마운트 근본
방지는 별도 후보").

## Fix direction (robust structural cure — end the saga)
Guarantee that only the foreground-visible instance holds the live-match registry slots, with a
release that SURVIVES freezeOnBlur (a navigation blur listener, not a React effect, since the
frozen tree won't run the effect cleanup). A backgrounded/frozen mount must always yield the
`match-progress:<id>` (and the poll) slot to the visible instance; the existing retry then
reclaims within ~1 tick. Alternative levers: gate the redundant mount so it never acquires
(RunningScreen/TrackRunScreen/heavyTickersFocusGate — SAFE, non-protected); harden the steal to a
per-key owner-activity stamp (useMatchProgressSync — PROTECTED, additive).

Protected files (additive-only): useMatchProgressSync, useLinkedMatchSync, matchStateMachine,
serverClockSync, countdown funnel, useTrackRunMatchStatusLoaders. SAFE: the screen mounts +
heavyTickersFocusGate wiring.

## On-device discriminators
- Confirms this latch: `'progress heartbeat skipped' reason:'duplicate-heartbeat-owner'` ~1/s on
  the visible instance + `'heartbeat duplicate blocked'` per retry, with NO
  `'progress heartbeat slot stolen from stale owner'`.
- Confirms push-death not poll gap: `'duel match status set from poll'` keeps arriving with
  `opponentLiveUpdatedAt:null`.
- Fast field check: background+foreground ONE phone — the resume path's background flush POST
  bypasses the heartbeat-slot gate, so the OTHER phone's opponent dot jumps once then re-freezes.
- Confirms fix: `'progress heartbeat slot reacquired after retry'` + opponent `liveUpdatedAt`
  advancing + arena promotes off the placeholder.
