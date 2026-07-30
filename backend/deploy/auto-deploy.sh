#!/usr/bin/env bash
# 러닝그라운드 자동 배포 (오너 요청 2026-07-31: "알아서 업데이트 되게").
# cron이 2분마다 호출 — 원격 브랜치에 새 커밋이 있을 때만 pull + deploy-production.sh.
# 로그: ~/auto-deploy.log. 중단하려면: crontab -e 에서 auto-deploy 줄 삭제.
set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/RunningGround}"
BRANCH="fix/countdown-local-tick"
LOCK_FILE="/tmp/rg-auto-deploy.lock"

# 이전 배포가 아직 도는 중이면 겹치지 않게 조용히 종료.
exec 9>"$LOCK_FILE"
flock -n 9 || exit 0

cd "$REPO_DIR"
git fetch origin "$BRANCH" --quiet
LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse "origin/$BRANCH")"

if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  exit 0
fi

echo "[auto-deploy] $(date -Is) ${LOCAL_SHA:0:7} -> ${REMOTE_SHA:0:7}"
rm -f backend/data/.gitkeep
git pull origin "$BRANCH" --quiet
cd backend
bash deploy-production.sh
echo "[auto-deploy] $(date -Is) done ${REMOTE_SHA:0:7}"
