# Backend Repositories

Repository modules are the migration seam between the current JSON store and the future PostgreSQL store.

Current status:
- `authRepository.mjs` owns username availability, login, logout, and registration.
- `postgresAuthRepository.mjs` mirrors the same auth methods against PostgreSQL-style tables.
- `runsRepository.mjs` owns manual runs, tracked runs, integration import queueing, and duplicate-safe sync.
- `postgresRunsRepository.mjs` mirrors the same run/import methods against PostgreSQL-style tables.
- `../database/postgresDatabase.mjs` now provides the shared PostgreSQL `query / transaction / close / check` adapter.
- Repository tests lock JSON auth, PostgreSQL auth, JSON runs, and PostgreSQL runs behavior before routes switch drivers.
- Runtime still uses the JSON implementation.
- PostgreSQL runtime wiring still needs safe route-by-route adoption because token lookup, rankings, and admin views still read the JSON store today.

The route layer should keep request parsing, response formatting, and API error messages. Repositories should own data lookup, inserts, updates, and duplicate checks.

Run repository tests:

```bash
npm --prefix backend run test:repositories
```
