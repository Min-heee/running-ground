# Backend Repositories

Repository modules are the migration seam between the current JSON store and the future PostgreSQL store.

Current status:
- `authRepository.mjs` owns username availability, login, logout, and registration.
- Runtime still uses the JSON implementation.
- PostgreSQL implementations should match the same method names before routes switch drivers.

The route layer should keep request parsing, response formatting, and API error messages. Repositories should own data lookup, inserts, updates, and duplicate checks.
