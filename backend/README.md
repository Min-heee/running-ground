# Backend Desktop Guide

이 백엔드는 데스크탑에서 바로 실행하거나 Docker Desktop으로 띄울 수 있게 준비되어 있어.

## 1. 로컬 Node 실행

```bash
cd backend
cp .env.example .env
npm run dev
```

루트에서도 실행 가능해:

```bash
cd ..
npm run backend:dev
```

기본 주소는 `http://localhost:8081` 이고, 앱에서는 `/api` 를 붙여서 사용해.

### 1.1. 지도로 그림 그리기 방향

`지도로 그림 그리기`는 백엔드 유료 라우팅 API에 묶지 않고, 앱 안에서 그림 목표선을 만든 뒤 실제 도보 길 확인은 카카오맵/네이버지도 앱으로 넘기는 방향으로 정리했어.

지금 역할은 이렇게 나뉘어 있어.
- RUNNIGAPP: 원하는 모양, 희망 거리, 출발지 기준으로 그림 목표선 만들기
- 카카오맵/네이버지도: 실제 도보 이동 가능 경로 확인
- RUNNIGAPP: 러닝 중 실제 GPS 기록 저장, 목표선과 실제 경로 비교

이렇게 하면 특정 유료 경로 API에 묶이지 않고, 한국 사용자에게 익숙한 지도앱을 바로 활용할 수 있어.

## 2. Docker 실행

Docker Desktop이 있으면 아래처럼 바로 올릴 수 있어.

```bash
cd backend
docker compose -f ./compose.yaml up --build -d
```

루트 스크립트도 준비돼 있어.

```bash
cd ..
npm run backend:docker:up
```

로그 확인:

```bash
npm run backend:docker:logs
```

중지:

```bash
npm run backend:docker:down
```

## 2.5. preview / production 환경 검증

실제 배포 전에 env 파일이 안전한지 먼저 확인할 수 있어.

예시 파일:
- preview: [backend/.env.preview.example](/backend/.env.preview.example)
- production: [backend/.env.production.example](/backend/.env.production.example)

preview:

```bash
cd backend
cp .env.preview.example .env.preview
npm run validate:preview
```

production:

```bash
cp .env.production.example .env.production
npm run validate:production
```

루트에서도 가능해:

```bash
cd ..
npm run backend:release:check:preview
npm run backend:release:check:production
```

이 검증은 아래 같은 실수를 막아줘.
- preview/production인데 `BACKEND_PUBLIC_BASE_URL` 이 빠진 경우
- 공개 주소가 `http`, `localhost`, 사설 IP 인 경우
- reset endpoint 가 켜진 경우
- 자동 백업이 꺼진 경우

## 2.6. HTTPS 공개 배포 템플릿

지금은 가장 단순하고 락인 적은 경로로 `Docker + Caddy` 템플릿을 넣어뒀어.

관련 파일:
- compose: [backend/compose.public.yaml](/backend/compose.public.yaml)
- reverse proxy: [backend/Caddyfile](/backend/Caddyfile)

preview 배포:

```bash
cd backend
cp .env.preview.example .env.preview
npm run docker:public:preview
```

production 배포:

```bash
cd backend
cp .env.production.example .env.production
npm run docker:public:production
```

루트에서도 가능해:

```bash
cd ..
npm run backend:docker:public:preview
npm run backend:docker:public:production
```

로그:

```bash
npm run backend:docker:public:production:logs
```

중지:

```bash
npm run backend:docker:public:production:down
```

필수 준비:
- `PUBLIC_DOMAIN`: 실제 DNS 가 연결된 도메인
- `ACME_EMAIL`: Caddy/Let's Encrypt 인증서 발급용 메일
- `BACKEND_PUBLIC_BASE_URL`: `https://도메인` 형식

즉 지금은 도메인만 준비되면 HTTPS 백엔드를 바로 띄울 수 있는 상태야.

### 2.6.1. 고정 HTTPS 백엔드 배포 명령

도메인의 DNS `A` 레코드가 백엔드를 띄울 서버 공인 IP를 가리키고, 서버에 Docker가 준비되어 있으면 아래 명령으로 `.env.preview` / `.env.production` 생성, 환경 검증, Docker + Caddy 실행, 공개 health check까지 한 번에 진행할 수 있어.

preview:

```bash
cd ..
npm run backend:deploy:public -- --env preview --domain preview-api.runnigapp.com --email ops@runnigapp.com --sync-eas-preview
```

production:

```bash
npm run backend:deploy:public -- --env production --domain api.runnigapp.com --email ops@runnigapp.com
```

먼저 파일 생성 없이 검증만 해보고 싶으면:

```bash
npm run backend:deploy:public -- --env preview --domain preview-api.runnigapp.com --email ops@runnigapp.com --dry-run
```

DNS가 서버를 제대로 가리키는지 먼저 확인하려면:

```bash
npm run backend:check-domain -- --domain preview-api.runnigapp.com --expected-ip 서버공인IP --skip-health
```

배포 후 health까지 강하게 확인하려면:

```bash
npm run backend:check-domain -- --domain preview-api.runnigapp.com --require-ports --require-health
```

이 명령은 아래를 자동으로 처리해.
- `backend/.env.preview` 또는 `backend/.env.production` 생성
- `backend/scripts/validate-env.mjs` 로 운영 환경 검증
- DNS 사전 점검
- [backend/compose.public.yaml](/backend/compose.public.yaml) 실행
- `https://도메인/api/health` 확인
- `--sync-eas-preview` 를 붙인 경우 TestFlight용 EAS preview API 주소 갱신

## 2.6.2. Windows 데스크탑 임시 preview 공개 실행

도메인과 Docker Desktop이 아직 없어도, Windows 데스크탑에서 `Cloudflare Quick Tunnel`로 preview HTTPS 주소를 바로 열 수 있게 스크립트를 준비해뒀어.

한 번만 설치:

```powershell
winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
```

시작:

```powershell
cd ..
.\scripts\windows\start-preview-public-backend.cmd
```

중지:

```powershell
.\scripts\windows\stop-preview-public-backend.cmd
```

이 스크립트가 해주는 일:
- `backend/.env` 를 preview용으로 다시 씀
- 루트 `.env` 도 같은 preview API 주소로 맞춤
- 백엔드를 다시 띄움
- `trycloudflare.com` 임시 HTTPS 주소를 열어줌
- 실행 결과를 `preview-public-info.json` 에 저장

Mac에서 TestFlight가 볼 EAS preview 환경까지 맞추려면, 공개 주소가 준비된 뒤 아래 명령을 한 번 실행하면 돼.

```bash
cd ..
npm run preview:sync-eas-env
```

데스크탑과 맥북 저장소가 분리되어 있어서 `preview-public-info.json` 이 맥북에 없다면 주소를 직접 넘겨도 돼.

```bash
npm run preview:sync-eas-env -- --api-base-url https://YOUR-TUNNEL.trycloudflare.com/api
```

결과 파일:
- info: `preview-public-info.json`
- backend 로그: `backend-preview.out.log`, `backend-preview.err.log`
- tunnel 로그: `preview-tunnel.out.log`, `preview-tunnel.err.log`

주의:
- 이 주소는 실행할 때마다 바뀔 수 있는 임시 preview 주소야.
- 데스크탑이 꺼지거나 스크립트로 띄운 프로세스가 종료되면 같이 내려가.
- 정식 production 공개 주소는 이 방식이 아니라 커스텀 도메인 + 고정 배포로 가는 게 맞아.

## 2.6.3. Windows 데스크탑 고정 preview 공개 실행 with Tailscale Funnel

데스크탑에 Tailscale이 이미 연결되어 있다면, `Cloudflare Quick Tunnel` 대신 `Tailscale Funnel`로 더 안정적인 preview 주소를 쓸 수 있어.

시작:

```powershell
cd ..
.\scripts\windows\start-preview-public-backend.cmd -Transport tailscale-funnel
```

상태 확인:

```powershell
.\scripts\windows\status-preview-public-backend.cmd
```

중지:

```powershell
.\scripts\windows\stop-preview-public-backend.cmd
```

특징:
- 주소가 매번 바뀌는 `trycloudflare.com` 대신 `https://<machine>.<tailnet>.ts.net` 고정 주소를 쓴다.
- Docker, Caddy, 공인 DNS 없이도 preview HTTPS 주소를 만들 수 있다.
- 라우터 포트 포워딩 없이도 iPhone TestFlight 앱이 접근할 수 있다.
- 한 번만 Tailscale Funnel 승인을 해두면 이후에는 같은 명령으로 다시 올릴 수 있다.

첫 실행에서 Funnel이 아직 허용되지 않았다면, 스크립트가 아래처럼 승인 URL을 보여준다.

```text
Tailscale Funnel needs one-time approval: https://login.tailscale.com/f/funnel?node=...
```

그 URL을 한 번 열어서 승인한 뒤 같은 명령을 다시 실행하면 된다.

추천 흐름:
1. `start-preview-public-backend.cmd -Transport tailscale-funnel`
2. 필요하면 Funnel 승인 URL 한 번 열기
3. `npm run preview:sync-eas-env -- --api-base-url https://<machine>.<tailnet>.ts.net/api`
4. TestFlight preview 빌드 다시 올리기

## 2.7. 스모크 테스트

백엔드 단독으로 핵심 출시 흐름을 한 번에 검증할 수 있어.

```bash
cd backend
npm run smoke
```

루트에서도 가능해.

```bash
cd ..
npm run backend:smoke
```

이 스크립트는 임시 store 파일로 서버를 띄운 뒤 아래 흐름을 자동 확인해.

- 회원가입
- 로그인
- 프로필 수정
- 지역/대학 리그 조회
- 연동 연결/동기화/해제
- 마켓 리워드 교환
- 친구 요청 생성/수락/활동 조회
- 대학 리그 반영
- 로그아웃 후 세션 무효화
- 관리자 상태 / 리셋 엔드포인트

## 2.8. 저장소 백업 / 복구

JSON 저장소를 계속 쓰는 동안은 백업이 중요해. 지금은 저장할 때 기존 파일을 자동으로 백업할 수 있고, 수동 백업/복구 CLI도 준비돼 있어.

수동 백업:

```bash
cd backend
npm run backup
```

백업 목록:

```bash
npm run backups
```

특정 백업 복구:

```bash
npm run restore -- store-20260415-210501-123-manual-ab12cd.json
```

루트에서도 가능해:

```bash
cd ..
npm run backend:backup
npm run backend:backups
npm run backend:restore -- store-20260415-210501-123-manual-ab12cd.json
```

복구 전에 현재 저장소는 `pre-restore` 이름으로 한 번 더 백업돼.

## 2.9. Provider import CLI

플랫폼 어댑터나 데스크탑 테스트에서 JSON으로 뽑은 러닝 기록을 바로 백엔드 import queue로 넣고 sync까지 진행할 수 있어.

```bash
cd ..
npm run provider:import -- \
  --username smoke-user \
  --password smoke-pass \
  --source health_connect \
  --file ./sample-runs.json
```

`sample-runs.json` 예시:

```json
[
  {
    "externalId": "health-001",
    "date": "2026-04-15",
    "distanceKm": 5.2,
    "pace": "05:31/km"
  }
]
```

옵션:
- `--queue-only`: import queue에만 적재하고 sync는 나중에 따로 실행
- `--no-connect`: source connect 호출 없이 바로 import
- `--base-url http://localhost:8081/api`: 기본 API 주소 변경

## 3. 환경 변수

`backend/.env.example` 기준:

- `BACKEND_APP_ENV`: 기본 `development`, 운영 구분용 문자열
- `BACKEND_HOST`: 기본 `0.0.0.0`
- `BACKEND_PORT`: 기본 `8081`
- `BACKEND_CORS_ORIGIN`: 웹 검증용 origin, 기본 `*`
- `BACKEND_PUBLIC_BASE_URL`: 서버 외부 접근 기준 주소
- `BACKEND_STORE_DRIVER`: 저장소 드라이버, 현재 런타임은 `json` 지원
- `BACKEND_STORE_FILE`: JSON 저장 파일 위치
- `BACKEND_STORE_BACKUP_DIRECTORY`: 백업 파일 폴더
- `BACKEND_STORE_BACKUP_ON_SAVE`: 저장 시 기존 store 자동 백업 여부
- `BACKEND_STORE_BACKUP_RETENTION`: 남겨둘 백업 개수
- `BACKEND_POSTGRES_DATABASE_URL`: PostgreSQL 연결 주소, `DATABASE_URL` 대체용으로도 사용 가능
- `BACKEND_POSTGRES_SSL`: PostgreSQL SSL 사용 여부
- `BACKEND_POSTGRES_POOL_MAX`: PostgreSQL pool 최대 연결 수
- `BACKEND_POSTGRES_IDLE_TIMEOUT_MS`: PostgreSQL idle timeout
- `BACKEND_POSTGRES_CONNECTION_TIMEOUT_MS`: PostgreSQL 연결 타임아웃
- `BACKEND_POSTGRES_APPLICATION_NAME`: PostgreSQL application name
- `BACKEND_SESSION_TTL_HOURS`: 세션 유지 시간, 기본 `168`
- `BACKEND_MAX_BODY_SIZE_KB`: JSON 요청 본문 최대 크기, 기본 `256`
- `BACKEND_REQUEST_TIMEOUT_MS`: 요청 전체 타임아웃, 기본 `30000`
- `BACKEND_HEADERS_TIMEOUT_MS`: HTTP 헤더 수신 타임아웃, 기본 `10000`
- `BACKEND_KEEP_ALIVE_TIMEOUT_MS`: keep-alive 연결 유지 시간, 기본 `5000`
- `BACKEND_MAX_REQUESTS_PER_SOCKET`: 소켓당 최대 요청 수, 기본 `1000`
- `BACKEND_SHUTDOWN_TIMEOUT_MS`: 종료 신호 후 강제 종료까지 대기 시간, 기본 `10000`
- `BACKEND_ADMIN_TOKEN`: 관리자 토큰
- `BACKEND_ENABLE_ADMIN_STATUS`: 관리자 상태 조회 열기 여부
- `BACKEND_ENABLE_RESET_ENDPOINT`: 관리자 리셋 엔드포인트 열기 여부
- `PUBLIC_DOMAIN`: 공개 HTTPS 배포용 도메인
- `ACME_EMAIL`: Caddy 인증서 발급용 이메일

`BACKEND_STORE_FILE` 을 다른 경로로 바꾸면 데스크탑의 별도 데이터 파일을 사용할 수 있어.

`BACKEND_CORS_ORIGIN` 은 `*` 또는 쉼표로 구분한 여러 origin 값을 받을 수 있어.

저장소는 원자적으로 저장되고, `BACKEND_STORE_BACKUP_ON_SAVE=true` 이면 변경 전 store 파일이 자동으로 백업돼.

PostgreSQL 연결 정보만 먼저 준비해두고 싶은 경우에는 아래 명령으로 가볍게 연결 상태를 확인할 수 있어.

```bash
npm --prefix backend run db:check
```

예시:

```env
BACKEND_CORS_ORIGIN=http://localhost:8081,http://127.0.0.1:8081
```

### 데스크탑/내부 테스트용 예시

```env
BACKEND_APP_ENV=preview
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8081
BACKEND_PUBLIC_BASE_URL=http://192.168.0.10:8081
BACKEND_CORS_ORIGIN=*
BACKEND_STORE_DRIVER=json
BACKEND_STORE_FILE=backend/data/store.json
BACKEND_STORE_BACKUP_DIRECTORY=backend/data/backups
BACKEND_STORE_BACKUP_ON_SAVE=true
BACKEND_STORE_BACKUP_RETENTION=10
BACKEND_POSTGRES_DATABASE_URL=postgres://runnigapp:runnigapp-preview-password@localhost:5432/runnigapp_preview
BACKEND_POSTGRES_SSL=false
BACKEND_POSTGRES_POOL_MAX=10
BACKEND_POSTGRES_IDLE_TIMEOUT_MS=30000
BACKEND_POSTGRES_CONNECTION_TIMEOUT_MS=10000
BACKEND_POSTGRES_APPLICATION_NAME=runnigapp-backend-preview
BACKEND_SESSION_TTL_HOURS=168
BACKEND_MAX_BODY_SIZE_KB=256
BACKEND_ADMIN_TOKEN=change-me
BACKEND_ENABLE_ADMIN_STATUS=true
BACKEND_ENABLE_RESET_ENDPOINT=false
```

### 운영에 가까운 예시

```env
BACKEND_APP_ENV=production
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8081
BACKEND_PUBLIC_BASE_URL=https://api.runnigapp.com
BACKEND_CORS_ORIGIN=https://app.runnigapp.com
BACKEND_STORE_DRIVER=json
BACKEND_STORE_FILE=/srv/runnigapp/store.json
BACKEND_STORE_BACKUP_DIRECTORY=/srv/runnigapp/backups
BACKEND_STORE_BACKUP_ON_SAVE=true
BACKEND_STORE_BACKUP_RETENTION=20
BACKEND_POSTGRES_DATABASE_URL=postgres://runnigapp:replace-me@postgres:5432/runnigapp_production
BACKEND_POSTGRES_SSL=false
BACKEND_POSTGRES_POOL_MAX=10
BACKEND_POSTGRES_IDLE_TIMEOUT_MS=30000
BACKEND_POSTGRES_CONNECTION_TIMEOUT_MS=10000
BACKEND_POSTGRES_APPLICATION_NAME=runnigapp-backend-production
BACKEND_SESSION_TTL_HOURS=168
BACKEND_MAX_BODY_SIZE_KB=256
BACKEND_REQUEST_TIMEOUT_MS=30000
BACKEND_HEADERS_TIMEOUT_MS=10000
BACKEND_KEEP_ALIVE_TIMEOUT_MS=5000
BACKEND_MAX_REQUESTS_PER_SOCKET=1000
BACKEND_SHUTDOWN_TIMEOUT_MS=10000
BACKEND_ADMIN_TOKEN=replace-this
BACKEND_ENABLE_ADMIN_STATUS=true
BACKEND_ENABLE_RESET_ENDPOINT=false
```

## 4. 운영 전 점검용 엔드포인트

### Health

```bash
curl http://localhost:8081/api/health
```

응답에는 현재 환경, 공개 주소, CORS 정책, 타임아웃, 최대 요청 크기, store 파일/백업 상태 같은 운영 점검 정보도 포함돼. store JSON이 깨진 경우에는 최신 정상 백업을 자동 복구하고, 복구 가능한 백업이 없으면 `503`과 진단 메시지를 내려.

### Logout

```bash
curl -X POST -H "Authorization: Bearer <token>" http://localhost:8081/api/auth/logout
```

### Admin status

관리자 토큰이 있을 때만 동작해.

```bash
curl -H "X-Admin-Token: change-me" http://localhost:8081/api/admin/status
```

PowerShell:

```powershell
Invoke-RestMethod -Headers @{ "X-Admin-Token" = "change-me" } -Uri http://localhost:8081/api/admin/status
```

### Desktop preview status

데스크탑에서 Cloudflare Quick Tunnel 기반 preview 백엔드를 열어두는 동안에는 아래 명령으로 현재 상태를 한 번에 확인할 수 있어.

```powershell
scripts\windows\status-preview-public-backend.cmd
```

데스크탑이 직접 백엔드 Node 프로세스를 계속 유지하게 하려면 작업 스케줄러 태스크를 설치해.

```powershell
scripts\windows\install-preview-backend-task.cmd -StartNow
```

확인 항목:
- backend/tunnel PID가 살아 있는지
- 로컬 `http://127.0.0.1:8081/api/health` 가 정상인지
- 공개 `https://...trycloudflare.com/api/health` 가 정상인지
- store 사용자/기록/백업 개수가 보이는지
- 로그 파일 위치와 다음 조치가 무엇인지

자동화나 원격 점검에서 실패 코드를 받고 싶으면:

```powershell
scripts\windows\status-preview-public-backend.cmd -RequireHealthy
```

### Admin reset

`BACKEND_ENABLE_RESET_ENDPOINT=true` 일 때만 열려.

```bash
curl -X POST -H "X-Admin-Token: change-me" http://localhost:8081/api/admin/reset
```

PowerShell:

```powershell
Invoke-RestMethod -Method Post -Headers @{ "X-Admin-Token" = "change-me" } -Uri http://localhost:8081/api/admin/reset
```

## 5. Android 에뮬레이터 연결

데스크탑에서 백엔드와 Android 에뮬레이터를 같이 띄우면 앱 `.env` 는 보통 이렇게 두면 돼.

```env
EXPO_PUBLIC_USE_MOCK_API=false
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8081/api
EXPO_PUBLIC_API_TIMEOUT_MS=10000
```

같은 데스크탑 브라우저에서 웹으로 확인할 때는 `http://localhost:8081/api` 를 사용하면 돼.

## 6. 운영 안정성 메모

- Docker 이미지에는 healthcheck 가 포함돼 있어.
- 서버는 `SIGINT`, `SIGTERM` 신호를 받으면 graceful shutdown 으로 종료돼.
- store 파일은 temp 파일에 먼저 쓴 뒤 교체하는 원자적 저장 방식으로 기록돼.
- 자동 백업을 켜 두면 저장 전 상태를 `BACKEND_STORE_BACKUP_DIRECTORY` 에 남겨둘 수 있어.
- 데스크탑에서 오래 켜둘 때는 Docker 실행을 권장해.
