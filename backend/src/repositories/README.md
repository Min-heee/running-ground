# Backend Repositories

Repository modules are the migration seam between the current JSON store and the future PostgreSQL store.

Current status:
- `authRepository.mjs` owns username availability, login, logout, and registration.
- `postgresAuthRepository.mjs` mirrors the same auth methods against PostgreSQL-style tables.
- `authRepository.test.mjs` and `postgresAuthRepository.test.mjs` lock both implementations before routes switch drivers.
- Runtime still uses the JSON implementation.
- PostgreSQL runtime wiring still needs a database adapter with a real `query(sql, params)` method and transaction support.

The route layer should keep request parsing, response formatting, and API error messages. Repositories should own data lookup, inserts, updates, and duplicate checks.

Run repository tests:

```bash
npm --prefix backend run test:auth
```
