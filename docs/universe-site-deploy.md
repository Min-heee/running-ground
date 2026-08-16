# 우주 사이트 배포 (universe.running-ground.com)

오너 2026-08-16: "사이트로 내고싶은거여서 앱에는 안넣을거야". 우주는 앱 탭에서 빠졌고
독립 웹으로 나간다. 방문자는 로그인 없이 전국 우주를 볼 수 있고, 자기 별을 가지려면
그때 로그인한다.

## 지금 상태

- 앱: 우주 탭 제거됨. `app/universe.tsx`는 남아 있고 **공개 라우트**다(rootAuthGate).
- 백엔드: `GET /api/public/universe`, `GET /api/public/universe/search` 추가됨.
  토큰을 요구하지 않는 유일한 읽기 경로. **아직 배포 안 됨.**
- 클라: 토큰이 있으면 인증 경로, 없으면 공개 경로로 자동 분기.
- 정적 빌드: `npx expo export --platform web --output-dir dist-web` → 6.4MB 단일 번들.

## 배포 전에 오너가 정해야 할 것

**공개 경로가 켜지는 순간 회원 이름과 이번 달 거리가 공개 인터넷에 노출된다.**
앱 안에서는 로그인한 회원끼리만 보이던 정보다. 개별 비공개(옵트아웃)는 아직 없다.
이걸 확인받기 전에는 백엔드를 배포하지 않는다.

## 1. DNS (오너)

A 레코드 하나:

    universe.running-ground.com.  A  <SERVER_IP>

## 2. 백엔드 배포

공개 엔드포인트가 살아야 사이트가 뜬다. 배포는 늘 하던 대로 `fix/countdown-local-tick`에
올리면 드롭릿 크론(2분)이 받아간다.

## 3. 정적 파일 올리기

    npx expo export --platform web --output-dir dist-web
    rsync -avz --delete dist-web/ root@<SERVER_IP>:/var/www/universe/

## 4. nginx

SPA라 라우트가 하나뿐이다 — 어떤 경로로 들어와도 index.html을 돌려줘야 한다.

```nginx
server {
    listen 80;
    server_name universe.running-ground.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name universe.running-ground.com;

    # certbot --nginx -d universe.running-ground.com 으로 발급
    ssl_certificate     /etc/letsencrypt/live/universe.running-ground.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/universe.running-ground.com/privkey.pem;

    root /var/www/universe;
    index index.html;

    # 해시가 박힌 번들은 영구 캐시, index.html은 매번 확인 — 배포 후 새로고침 한 번에
    # 새 버전이 뜨게 하는 유일한 조합이다.
    location /_expo/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache";
    }
}
```

## 5. CORS

사이트(`universe.running-ground.com`)와 API(`api.running-ground.com`)가 다른 오리진이라
백엔드가 이 오리진을 허용해야 한다. `applyCorsHeaders`가 어디까지 허용하는지 확인하고,
필요하면 이 도메인을 추가한다.

## 남은 것

- 번들이 6.4MB다 — 앱 전체가 들어 있다. 사이트만 따로 빌드하면 훨씬 가벼워지지만,
  지금 구조(같은 Expo 프로젝트)를 유지하는 대가다. 로딩이 문제가 되면 그때 분리한다.
- 로그인: 사이트에서 자기 별을 가지려면 웹 로그인 플로우가 필요하다(전화번호 SMS 인증).
  지금은 앱에서 로그인한 세션이 있는 브라우저에서만 '내 별'이 보인다.
