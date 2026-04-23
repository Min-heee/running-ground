# Backend Database

이 폴더는 RUNNIGAPP 백엔드를 JSON 저장소에서 PostgreSQL 운영 저장소로 옮기기 위한 기준 파일을 둔다.

현재 런타임은 아직 `backend/src/store.mjs` 기반 JSON 저장소를 사용한다. `schema.sql`은 바로 production에 적용하기 전 검토할 목표 스키마이며, 다음 단계에서 migration script와 PostgreSQL adapter가 붙을 예정이다.

## 기준
- 기존 JSON store의 `user-`, `run-` 같은 id 형식을 보존하기 위해 초기 스키마는 `text` id를 쓴다.
- 앱 화면에 노출되는 이름은 `nickname`이고, `real_name`, `phone`, `birth_date`, `address_detail`은 비공개 개인정보로 취급한다.
- Health/NRC/Garmin/Strava 기록 중복 방지는 `external_id`가 있으면 unique index로, 없으면 날짜/거리/페이스 fingerprint로 처리한다.
- 러닝 route는 우선 `jsonb`로 저장하고, 경로 분석 기능이 커지면 별도 route point 테이블로 분리한다.
- 레이스는 장소 집결형이 아니라 각자 뛰는 remote 운영을 기본값으로 둔다.

## 적용 순서
1. Preview PostgreSQL 컨테이너를 따로 띄운다.
2. `schema.sql`을 적용한다.
3. JSON store를 읽어서 PostgreSQL에 넣는 migration script를 만든다.
4. smoke test를 JSON과 PostgreSQL 양쪽에서 통과시킨다.
5. TestFlight preview API부터 PostgreSQL로 전환한다.

## 로컬 PostgreSQL 미리 띄우기
아직 API 서버는 이 DB를 사용하지 않는다. 스키마 검증과 migration script 개발용이다.

```bash
npm --prefix backend run db:up
npm --prefix backend run db:psql
npm --prefix backend run db:down
```

기본 접속 정보:
- database: `runnigapp_preview`
- user: `runnigapp`
- password: `runnigapp-preview-password`
- port: `5432`

## JSON store migration dry-run
현재 JSON store를 PostgreSQL insert SQL로 변환하기 전에 dry-run으로 테이블별 건수와 누락 필드를 확인한다.

```bash
npm --prefix backend run db:migrate:dry-run
```

SQL 파일을 만들 때:

```bash
npm --prefix backend run db:migrate:sql
```

생성된 SQL은 `backend/db/schema.sql`을 먼저 적용한 DB에 넣는다.

```bash
psql "$DATABASE_URL" -f backend/db/schema.sql
psql "$DATABASE_URL" -f backend/db/generated/json-store-YYYYMMDDTHHMMSSZ.sql
```

활성 로그인 세션을 옮기지 않을 때:

```bash
node backend/db/migrate-json-to-postgres.mjs --dry-run --skip-sessions
```
