# Backend load test — concurrent-match capacity ladder

`backend/scripts/load-test.mjs` measures how many **simultaneous live matches** the backend
can carry before the whole-store Postgres write path (one jsonb row, every mutation a
serialized `SELECT ... FOR UPDATE` read-modify-write) becomes the bottleneck.

It is **local-only by construction**: it boots the real server (`src/server.mjs`) as a child
process against a loopback Postgres and refuses to start if the database URL is not loopback.
It never touches api.running-ground.com.

## What it does

1. Boots the backend with `BACKEND_STORE_DRIVER=postgres` (the production store architecture),
   `BACKEND_APP_ENV=development`, mock SMS provider. Per-IP SMS/login rate limits are lifted
   (everything comes from 127.0.0.1 here; production sees distinct device IPs).
2. Registers real users through the phone-OTP register flow and seeds `--filler-runs-per-user`
   manual runs each, so the store row has production-shaped weight instead of being trivially
   small.
3. Per ladder step, creates M concurrent duels (2 real runners each, fresh users every step)
   through the party-run room seam — the exact HTTP flow `runningMatchContract.test.mjs`
   drives: create room → join → ready → start → countdown-ready — then waits for the slot.
4. Replays the live-match client traffic shape **open-loop** (ticks fire on schedule whether
   or not the previous response returned — how real phones behave, and what exposes queue
   collapse): one progress POST per runner every 2.5s, plus an idle read population
   (GET /api/home/summary every 15s) and an unauthenticated /api/health probe every 2s
   (health touches no store, so it isolates api-process event-loop health from store-queue
   latency).
5. Reports per step: p50/p95/p99/max latency + errors per endpoint class, api child CPU%/RSS,
   postgres process-tree CPU%, `pg_stat_activity` lock-wait counts, and `pg_column_size` of
   the app_store row at step start/end. Writes a markdown report + raw JSON to `--out`.

## One-time local Postgres setup (Homebrew, no Docker)

```sh
export LC_ALL=C   # macOS: postgres refuses to start under a UTF-8 shell locale
initdb -D /tmp/loadtest-pg/data -U loadtest -A trust -E UTF8 --no-locale
pg_ctl -D /tmp/loadtest-pg/data -l /tmp/loadtest-pg/postgres.log \
  -o "-p 15433 -c listen_addresses=127.0.0.1" start
psql -h 127.0.0.1 -p 15433 -U loadtest -d postgres -c "create database runningground_loadtest"
```

The harness applies `backend/db/schema.sql` itself (idempotent) and truncates
`app_store`/`run_routes` for a fresh run unless `--keep-data` is passed.

## Run

```sh
cd backend
node scripts/load-test.mjs \
  --pg-url postgres://loadtest@127.0.0.1:15433/runningground_loadtest \
  --steps 5,10,20,40,80 --step-seconds 75 --idle-pollers 20 \
  --filler-runs-per-user 8 --out /tmp/loadtest-results.md
```

Afterwards: `pg_ctl -D /tmp/loadtest-pg/data stop`.

## Flags

| flag | default | meaning |
|---|---|---|
| `--pg-url` | `postgres://loadtest@127.0.0.1:15433/runningground_loadtest` | loopback-only Postgres URL |
| `--port` | 18091 | backend child port |
| `--steps` | `5,10,20,40,80` | ladder of concurrent duel counts (2 runners each) |
| `--step-seconds` | 75 | steady-state duration per step |
| `--progress-interval-ms` | 2500 | per-runner progress POST cadence |
| `--idle-pollers` | 20 | users doing a home read every `--idle-poll-interval-ms` (15s) |
| `--group-matches` / `--group-size` | 0 / 5 | optional group matches added to every step |
| `--filler-runs-per-user` | 8 | saved runs per user (store-row weight knob) |
| `--request-timeout-ms` | 10000 | client-side per-request abort |
| `--pg-pool-max` | 10 | backend pg pool size (production default) |
| `--match-distance-km` | 5 | duel goal distance (long enough that no runner finishes mid-step) |
| `--keep-data` | off | skip the fresh-run truncate |

## Reading the result

- **Knee** = first step where progress p95 > 1s or errors/timeouts appear.
- api CPU pegged + pg CPU low + health latency rising → the api process's synchronous
  JSON parse/serialize of the whole store row is the wall.
- pg lock waits climbing + api CPU low → the single-row `FOR UPDATE` lock queue is the wall.
- This runs on a dev machine that is much faster than the production droplet: absolute
  numbers do NOT transfer, the shape (which resource saturates first, how the knee moves
  with store-row size) does. Re-derive absolute capacity on droplet-class hardware before
  trusting a number.
