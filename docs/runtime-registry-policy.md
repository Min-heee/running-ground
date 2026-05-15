# Runtime Registry Key Policy

RunningGround runtime registries use stable keys so polling, heartbeat, and active-room checks do not duplicate work during Android match transitions.

## Keys

| Runtime work | Key format | Owner |
| --- | --- | --- |
| Active room check | `active-room:<userId/source>` | `src/features/runs/sync/activeRoomCheck.ts` and lobby snapshot recovery |
| Blocking match status polling | `blocking-match-status:<matchId>` | `src/features/runs/sync/matchPolling/useBlockingMatchStatusPolling.ts` |
| Match progress heartbeat | `match-progress:<matchId>` | `src/features/runs/sync/useMatchProgressSync.ts` |

## Rules

- A key may have only one active slot at a time.
- Duplicate polling or heartbeat starts must reuse or skip the active owner instead of creating another interval.
- Cleanup must release the slot before the same key can start again.
- Late or stale active-room results must be ignored with generation/route checks instead of updating UI state.
- Domain files should use `registryKeys.ts`, `rgPollingRegistry.ts`, and `rgHeartbeatRegistry.ts` instead of building new ad-hoc registry patterns.
