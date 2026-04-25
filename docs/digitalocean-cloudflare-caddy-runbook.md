# DigitalOcean + Cloudflare + Caddy Runbook

## 추천 결론

RunningGround의 첫 운영 배포는 아래 조합을 기본값으로 잡는다.

- 서버: DigitalOcean Droplet 1대
- 리전: Singapore (`SGP1`)
- DNS: Cloudflare
- HTTPS / reverse proxy: Caddy
- 앱 API 도메인: `api.runningground.com`
- preview API 도메인: `preview-api.runningground.com`
- 백엔드 / DB: Docker Compose로 Node backend + PostgreSQL을 같은 서버에서 먼저 운영

이 조합을 기본값으로 잡는 이유는 아래와 같다.

- 지금 preview의 가장 큰 불안정 요소는 `trycloudflare.com` / `ts.net` 같은 임시 공개 주소다.
- 앱 출시 단계에서는 주소가 안 바뀌는 `고정 도메인`, 항상 켜져 있는 `고정 서버`, 터널에 의존하지 않는 `직접 HTTPS`가 필요하다.
- 관리형 플랫폼보다 처음 자유도가 높고, 나중에 다른 서버나 다른 클라우드로 옮겨도 도메인만 유지하면 된다.
- 이미 이 저장소에는 `Docker + Caddy` 배포 흐름과 production env 검증 흐름이 준비되어 있다.

## 대략 비용

2026-04-25 기준으로 거칠게 잡으면 아래 범위로 시작할 수 있다.

- DigitalOcean Droplet 엔트리: 공식 페이지 기준 `월 $4부터`
- 실제 운영 추천 예산:
  - 앱 서버 예산 `월 $12 전후`
  - 도메인 `연 $10 ~ $20`
  - Cloudflare DNS `무료 플랜`으로 시작 가능

초기 현실 예산은 아래처럼 잡는 걸 추천한다.

- 최소: `월 $10 ~ $15 + 도메인`
- 권장: `월 $12 ~ $20 + 도메인`

한국 원화 감각으로는 대체로 `월 1만 5천원 ~ 2만원대`를 생각하면 맞다.

## 왜 이 구성이 가장 좋나

### 1. 지금 당장도 어렵지 않다

- DigitalOcean은 서버 생성이 단순하고 문서가 많다.
- Cloudflare는 DNS 연결과 SSL 운영이 쉽다.
- Caddy는 인증서 발급과 갱신을 자동으로 처리한다.

### 2. 장기 운영에 유리하다

- API 주소를 `api.runningground.com` 으로 고정할 수 있다.
- 나중에 서버를 더 큰 사양으로 교체하거나, 다른 클라우드로 옮겨도 앱은 같은 도메인을 계속 쓴다.
- preview / production 을 깔끔하게 분리할 수 있다.

### 3. 지금 저장소 구조와 잘 맞는다

- `backend/compose.public.yaml`
- `backend/Caddyfile`
- `backend/.env.production.example`
- `scripts/deploy-public-backend.mjs`
- `scripts/migrate-public-postgres.mjs`

위 파일들이 이미 공개 서버 배포 흐름을 전제로 준비되어 있다.

## 추천 시작 사양

처음에는 아래를 기본으로 추천한다.

- Ubuntu 24.04 LTS
- 2 GB RAM Droplet 1대
- 1 vCPU 이상
- 50 GB 안팎의 SSD면 충분

1 GB로도 억지로 시작은 가능하지만, 아래를 같이 돌리면 여유가 빨리 줄어든다.

- Node backend
- PostgreSQL
- Caddy
- 로그 / 배포 / 예비 메모리

그래서 첫 운영은 `2 GB`부터 시작하는 쪽이 훨씬 편하다.

## 실제 구매 / 준비 순서

### 1. 도메인 준비

아래 둘을 쓸 수 있게 도메인을 준비한다.

- `api.runningground.com`
- `preview-api.runningground.com`

### 2. Cloudflare에 도메인 연결

- 도메인 등록기관에서 nameserver를 Cloudflare로 변경한다.
- Cloudflare DNS에서 이후 A 레코드를 관리한다.

### 3. DigitalOcean Droplet 생성

- 리전: `SGP1`
- 이미지: Ubuntu 24.04 LTS
- SSH 키 로그인 사용
- 먼저 비밀번호 로그인은 끄는 쪽을 추천
- User Data에는 아래 cloud-init 생성 결과를 넣으면 첫 부팅 때 기본 세팅이 자동으로 끝난다.

```bash
npm run server:render:cloud-init -- --hostname runningground-preview --ssh-user deploy > cloud-init-preview.yaml
```

DigitalOcean 생성 화면의 `Advanced Options -> Add Initialization Scripts (User Data)` 에 이 내용을 그대로 넣으면 된다.

### 4. 서버 기본 세팅

서버에 아래를 준비한다.

- Docker Engine
- Docker Compose
- 방화벽
- 시간대 / 기본 보안 업데이트

이 저장소에는 Ubuntu 서버 초기 세팅용 스크립트가 있다.

```bash
sudo bash ./scripts/bootstrap-ubuntu-server.sh
```

이 스크립트는 아래를 자동으로 맞춘다.

- apt 기본 업데이트
- Git / curl / jq / unzip 설치
- Docker Engine / Docker Compose plugin 설치
- Docker 서비스 활성화
- 현재 SSH 사용자 docker group 추가
- UFW에서 `OpenSSH`, `80`, `443` 허용

즉 두 가지 방식 중 하나를 고르면 된다.

- 더 쉬운 방식: `server:render:cloud-init` 결과를 Droplet User Data에 넣고 첫 부팅 때 자동 실행
- 수동 방식: SSH 접속 후 `sudo bash ./scripts/bootstrap-ubuntu-server.sh`

부팅 뒤 상태를 확인하려면 서버 안에서 아래 명령을 한 번 돌리면 된다.

```bash
npm run server:check:readiness
```

이 명령은 Docker, Compose plugin, docker service, docker group, UFW, `80/443` 규칙까지 한 번에 점검한다.

### 5. DNS 연결

Cloudflare에 아래 A 레코드를 만든다.

- `api` -> production 서버 공인 IP
- `preview-api` -> preview 서버 공인 IP

현재 공개 템플릿은 Caddy가 `80/443` 을 직접 쓰는 가장 단순한 구조라서, preview 와 production 을 동시에 public 으로 띄우려면 가장 쉬운 운영 기준은 `env당 서버 1대` 다.

### 6. Caddy + backend 배포

이 저장소 기준으로 아래 흐름을 탄다.

```bash
npm run backend:check-domain -- --domain preview-api.runningground.com --expected-ip SERVER_PUBLIC_IP --skip-health
npm run backend:deploy:public -- --env preview --domain preview-api.runningground.com --email ops@runningground.com --sync-eas-preview
npm run backend:deploy:public -- --env production --domain api.runningground.com --email ops@runningground.com
```

이 공개 스택은 이제 아래를 같이 띄운다.

- backend
- Caddy
- PostgreSQL

Docker Compose 프로젝트 이름으로 서비스명과 볼륨명 충돌은 피할 수 있지만, 현재 템플릿은 Caddy가 `80/443` 을 직접 점유하므로 preview / production 을 동시에 public 으로 붙일 때는 서버를 분리하거나 shared edge Caddy 구성을 추가해야 한다.

### 6.1. JSON 스냅샷을 public PostgreSQL 로 이관

초기 운영은 JSON 저장소를 유지하면서 PostgreSQL read bridge를 점진적으로 켜는 구조다. 서버에 기존 데이터가 있으면 아래 명령으로 public `api` 컨테이너의 JSON 스냅샷을 public `postgres` 컨테이너로 옮긴다.

```bash
npm run backend:migrate:public:postgres -- --env preview
npm run backend:migrate:public:postgres -- --env production
```

먼저 건수만 보려면:

```bash
npm run backend:migrate:public:postgres -- --env preview --dry-run
```

이관 후에는 `backend/.env.preview` 또는 `backend/.env.production` 의 `BACKEND_POSTGRES_ENABLE_*` 플래그를 순서대로 켜고 다시 배포한다.

### 7. 앱 연결

- TestFlight / preview 는 `preview-api.runningground.com/api`
- 실제 스토어 빌드는 `api.runningground.com/api`

## 운영 초기 원칙

초기에는 아래처럼 단순하게 시작한다.

- 서버 1대
- preview / production DB는 분리
- 앱 백엔드와 PostgreSQL은 같은 서버에서 시작
- 백업은 자동화
- uptime check는 외부에서 붙인다

## 나중에 바꾸기 쉬운 구조

이 구조는 나중에 아래처럼 확장하기 쉽다.

### 서버 사양 업그레이드

- 더 큰 Droplet로 교체
- 같은 도메인을 유지하고 DNS만 옮기면 된다

### DB 분리

- PostgreSQL만 별도 서버 또는 Managed DB로 이동
- 앱은 `api.runningground.com` 을 계속 쓴다

### 다른 클라우드로 이전

- DigitalOcean -> AWS / Hetzner / Vultr / Railway 가능
- 핵심은 도메인을 앱 안에 고정해두는 것이다

## 이 방식을 고를 때의 기준

이 선택은 아래 기준에서 가장 균형이 좋다.

- 오늘 바로 시작 가능한가: 좋음
- 장기 운영 안정성: 좋음
- 나중에 옮기기 쉬운가: 좋음
- 월 비용 예측 가능성: 좋음
- 완전 초보 친화성: 관리형 플랫폼보다 조금 어려움

그래도 장기적으로는 이 구조가 가장 덜 흔들린다.

## 다음에 실제로 필요한 것

실제 진행을 위해 사용자에게 필요한 입력은 딱 두 가지다.

- 최종 도메인명
- DigitalOcean 서버 공인 IP

이 두 개가 준비되면, 그 다음 단계는 저장소 문서와 스크립트 기준으로 바로 이어서 진행하면 된다.

도메인과 IP가 준비되면 아래 명령으로 실제 배포 순서를 한 번에 렌더링할 수 있다.

```bash
npm run server:render:deploy-plan -- --root-domain runningground.com --preview-ip 203.0.113.10 --production-ip 203.0.113.11
```

이 출력에는 아래가 같이 들어간다.
- Cloudflare A 레코드 표
- preview / production cloud-init 생성 명령
- readiness 확인 명령
- preview / production 공개 배포 명령
- JSON -> public PostgreSQL 이관 명령
