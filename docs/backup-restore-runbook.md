# 백업 · 복구 런북 (Postgres) — RunningGround

프로덕션 데이터(유저·러닝·랭크·친구·마켓 = whole-store jsonb + 관계형 테이블 전부)의
백업과 **드로플릿/디스크 소실 시 복구** 절차. 이 문서 하나면 장애 시 복구가 즉흥이 아니라
정해진 명령 실행이 되도록 하는 게 목적.

> **핵심 원칙**: 백업이 postgres 데이터와 **같은 디스크**에 있으면 드로플릿이 죽을 때 같이
> 죽는다. 그래서 매 덤프를 반드시 **오프사이트(DO Spaces 등 오브젝트 스토리지)**로 복제한다.
> `backend/pg_backup.sh`가 로컬 덤프 + 오프사이트 푸시를 모두 수행한다.

---

## 1. 구성 요소

| 요소 | 위치 | 역할 |
|---|---|---|
| `backend/pg_backup.sh` | 드로플릿 | 야간 `pg_dump -Fc` → gzip → 로컬 저장 → **rclone로 오프사이트 푸시** → 로컬·원격 보존기간 프루닝 |
| 로컬 덤프 | `backend/backups/postgres/*.dump.gz` | 최근 백업 (기본 14일 보존). 빠른 복구용. |
| 오프사이트 | DO Spaces 버킷 (rclone remote) | 드로플릿이 통째로 죽어도 남는 사본. **진짜 재해 복구선.** |

보존기간·경로·리모트는 전부 env 오버라이드 가능 (`BACKEND_BACKUP_RETENTION_DAYS`,
`BACKEND_BACKUP_DIR`, `BACKEND_BACKUP_RCLONE_REMOTE`).

---

## 2. 최초 셋업 (드로플릿에서 1회) — P0

### 2-1. rclone 설치 + DO Spaces 리모트 생성
```bash
# 드로플릿 SSH 접속 후
sudo apt-get update && sudo apt-get install -y rclone   # 또는: curl https://rclone.org/install.sh | sudo bash
rclone config
#   n) New remote
#   name>  spaces
#   Storage>  s3
#   provider>  DigitalOcean
#   access_key_id>     <Spaces 액세스 키>       # DO 콘솔 > API > Spaces Keys 에서 발급
#   secret_access_key> <Spaces 시크릿 키>
#   endpoint>  <region>.digitaloceanspaces.com   # 예: sgp1.digitaloceanspaces.com
#   (나머지 기본값)
```
DO 콘솔에서 Spaces 버킷을 하나 만든다 (예: `<BACKUP_BUCKET>`), **비공개(Private)**로.

### 2-2. .env.production에 리모트 경로 한 줄 추가
```bash
# backend/.env.production
BACKEND_BACKUP_RCLONE_REMOTE=spaces:<BACKUP_BUCKET>/postgres
```
> 이 변수가 **없으면** 백업은 로컬 전용으로만 동작하고 스크립트가 매 실행마다
> `WARN: ... LOCAL-ONLY` 를 크게 남긴다 (조용히 오프사이트가 꺼져 있는 상태 방지).

### 2-3. 리모트 연결 확인 + 첫 수동 백업
```bash
cd ~/RunningGround/backend   # 실제 배포 경로에 맞게
rclone lsd spaces:            # 버킷이 보이면 인증 OK
./pg_backup.sh                # 로그 끝에 "offsite copy OK" 나오면 성공
rclone ls spaces:<BACKUP_BUCKET>/postgres   # 원격에 .dump.gz 보이는지 확인
```

### 2-4. 야간 크론 등록 (아직이면)
```bash
crontab -e
# 매일 03:20 KST 백업 (드로플릿 TZ 확인: timedatectl)
20 3 * * *  /home/<user>/RunningGround/backend/pg_backup.sh >> /var/log/rg-pg-backup.log 2>&1
```
등록 확인: `crontab -l | grep pg_backup`
크론 메일/로그로 실패를 알 수 있게 로그 파일 경로를 둔다. (오프사이트 푸시 실패 시
스크립트는 **비정상 종료**하므로 크론이 실패로 잡는다.)

---

## 3. 복구 (Restore) — 드로플릿/디스크가 죽었을 때

### 시나리오 A: 새 드로플릿에 오프사이트 백업으로 복구 (완전 소실)
```bash
# 1) 새 드로플릿 프로비저닝 + 코드 배포 (docs/digitalocean-cloudflare-caddy-runbook.md)
#    compose로 postgres 서비스는 올라와 있고, DB는 비어있는 상태.

# 2) rclone 리모트 재설정 (2-1과 동일) 후 최신 덤프 내려받기
cd ~/RunningGround/backend
rclone lsl spaces:<BACKUP_BUCKET>/postgres     # 파일 목록 + 시각 확인
LATEST=$(rclone lsf spaces:<BACKUP_BUCKET>/postgres | sort | tail -1)
rclone copyto "spaces:<BACKUP_BUCKET>/postgres/$LATEST" "/tmp/$LATEST"
gunzip -k "/tmp/$LATEST"                              # /tmp/....dump 생성

# 3) 컨테이너 안 postgres로 복원 (compose 서비스명: postgres)
#    .env.production에서 DB 이름/유저 로드
set -a; . ./.env.production; set +a
DUMP="/tmp/${LATEST%.gz}"

# 3-a) 안전: 기존(빈) DB를 깨끗이 재생성하고 복원 (--clean --if-exists)
docker compose -p runningground-production -f compose.public.yaml --env-file .env.production \
  exec -T postgres pg_restore --clean --if-exists --no-owner --no-privileges \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$DUMP"

# 4) 검증
docker compose -p runningground-production -f compose.public.yaml --env-file .env.production \
  exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "select count(*) as users from users;" \
  -c "select jsonb_array_length(data->'runs') as runs from app_store where id=1;"

# 5) api 재기동 + 헬스체크
docker compose -p runningground-production -f compose.public.yaml --env-file .env.production restart api
curl -fsS https://api.running-ground.com/api/health
```

### 시나리오 B: 같은 드로플릿에서 로컬 최신 덤프로 롤백 (실수 삭제 등)
```bash
cd ~/RunningGround/backend
LATEST=$(ls -1t backups/postgres/*.dump.gz | head -1)
gunzip -k "$LATEST"
set -a; . ./.env.production; set +a
docker compose -p runningground-production -f compose.public.yaml --env-file .env.production \
  exec -T postgres pg_restore --clean --if-exists --no-owner --no-privileges \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "${LATEST%.gz}"
docker compose -p runningground-production -f compose.public.yaml --env-file .env.production restart api
```

> **주의**: `--clean --if-exists`는 복원 대상 테이블을 drop 후 재생성한다. 되돌릴 수 없으니
> 복원 전 현재 상태를 한 번 더 덤프해 두면 안전 (`./pg_backup.sh` 먼저 실행).

---

## 4. 점검 체크리스트 (월 1회 권장)
- [ ] `rclone ls spaces:<BACKUP_BUCKET>/postgres` — 최근 24h 내 새 덤프가 있나
- [ ] `crontab -l | grep pg_backup` — 크론이 살아있나
- [ ] 로그(`/var/log/rg-pg-backup.log`)에 `offsite copy OK`가 매일 찍히나 / `WARN LOCAL-ONLY` 없나
- [ ] **분기 1회 실전 복구 리허설**: 오프사이트 덤프를 임시 DB에 pg_restore 해보고 유저 수 확인 (복구가 실제로 되는지 검증하지 않은 백업은 백업이 아니다)
- [ ] DO 콘솔의 Droplet Backups(주간 스냅샷)도 켜져 있으면 이중 안전망 (선택)

---

## 5. 알아둘 것
- 덤프는 `pg_dump -Fc`(커스텀 포맷) → whole-store `app_store` jsonb 행 + 모든 관계형
  테이블 + 인덱스·트리거·`set_updated_at()` 함수까지 한 논리 덤프에 담긴다.
- 백업 간격이 24h이므로 **최대 24h 유실 창**이 존재한다. 더 촘촘히 하려면 크론 주기를 줄이거나
  (#209 route side-table 이관 후) 향후 WAL 아카이빙/PITR로 격상.
- 오프사이트 푸시가 실패하면 스크립트는 **비정상 종료**하되 로컬 덤프는 디스크에 남긴다 —
  즉 "로컬은 있는데 원격 복제 실패" 상태를 크론이 잡아 알린다.
