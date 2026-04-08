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

## 2.5. 스모크 테스트

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

## 3. 환경 변수

`backend/.env.example` 기준:

- `BACKEND_HOST`: 기본 `0.0.0.0`
- `BACKEND_PORT`: 기본 `8081`
- `BACKEND_CORS_ORIGIN`: 웹 검증용 origin, 기본 `*`
- `BACKEND_STORE_FILE`: JSON 저장 파일 위치
- `BACKEND_ADMIN_TOKEN`: 관리자 토큰
- `BACKEND_ENABLE_ADMIN_STATUS`: 관리자 상태 조회 열기 여부
- `BACKEND_ENABLE_RESET_ENDPOINT`: 관리자 리셋 엔드포인트 열기 여부

`BACKEND_STORE_FILE` 을 다른 경로로 바꾸면 데스크탑의 별도 데이터 파일을 사용할 수 있어.

## 4. 운영 전 점검용 엔드포인트

### Health

```bash
curl http://localhost:8081/api/health
```

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
