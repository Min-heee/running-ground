// 앱 다운로드 단축 링크: GET /download[?tag=CODE]
//
// 태그 공유 메시지의 apps.apple.com 링크는 카톡 등 메신저의 인앱 브라우저에서
// 웹 스토어 페이지를 먼저 띄워 "바로 안 열리는" 경험이 된다. 우리 도메인을
// 링크로 쓰고 iOS UA에는 itms-apps:// 스킴으로 302를 쏘면 인앱 브라우저도
// App Store 앱으로 즉시 넘어간다 (국내 서비스 공통 패턴). Android UA는 Play
// 스토어로(2026-08-04 인스타 프로필 링크용 추가 — v39 승인 전까지는 Play가
// "찾을 수 없음"을 보여주지만 승인 순간부터 자동으로 정상). 그 외(데스크톱)는
// App Store 웹 페이지로.
//
// ?tag=CODE 가 붙으면 (태그 공유 링크): 302 대신 스마트 랜딩 HTML을 서빙한다 —
// 설치된 폰에서는 runningground:// 딥링크로 앱의 친구 추가 화면(태그 자동 입력 +
// 자동 신청)이 열리고, 미설치면 잠시 후 스토어로 넘어간다. 앱 스킴은 이미 출시
// 바이너리(iOS 빌드 52 / Android vc39)에 등록돼 있어 재빌드 없이 동작한다.
const APP_STORE_WEB_URL = 'https://apps.apple.com/kr/app/id6762328694';
const APP_STORE_SCHEME_URL = 'itms-apps://apps.apple.com/kr/app/id6762328694';
const PLAY_STORE_WEB_URL = 'https://play.google.com/store/apps/details?id=com.minheee.runnigapp';

// publicTag 코드 형식(#뒤 3~8자 영숫자)만 통과 — HTML/URL에 박아 넣으므로 화이트리스트로 XSS 차단.
function sanitizeTagCode(rawTag) {
  const code = String(rawTag ?? '').replace(/^#/, '').trim().toUpperCase();
  return /^[A-Z0-9]{3,8}$/.test(code) ? code : null;
}

// 모바일 공통 다운로드 랜딩 (2026-08-05): 인앱 브라우저(인스타 등)는 302 자동
// 점프를 조용히 막는 경우가 있어 "안 열림"이 된다. 자동 이동을 시도하되, 실패해도
// 큰 버튼이 남아 사용자가 무조건 스토어로 갈 수 있는 방탄 구조.
// 버튼(primaryUrl)은 iOS에서 itms-apps 스킴: 302 스킴은 인앱 브라우저가 차단하지만
// 사용자 탭 제스처의 스킴 이동은 허용된다(인스타 실기기에서 https 탭이 무반응이던
// 사고의 우회). fallbackUrl은 스킴마저 안 먹는 환경용 보조 https 링크.
function buildDownloadLandingHtml({ primaryUrl, storeLabel, fallbackUrl, autoUrl }) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>러닝그라운드 다운로드</title>
<style>
  body { margin: 0; font-family: -apple-system, sans-serif; background: #EFF0FA; color: #111827;
         display: flex; flex-direction: column; align-items: center; justify-content: center;
         min-height: 100vh; gap: 14px; padding: 24px; text-align: center; }
  .logo { width: 76px; height: 76px; border-radius: 18px; background: #6D5EF7; color: #fff;
          font-size: 44px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
  .name { font-size: 22px; font-weight: 800; }
  .hint { color: #667085; font-size: 14px; line-height: 1.5; }
  a.button { display: block; width: 100%; max-width: 320px; padding: 15px 0; border-radius: 12px;
             text-decoration: none; font-weight: 700; background: #6D5EF7; color: #fff; font-size: 16px; }
  a.fallback { color: #667085; font-size: 13px; text-decoration: underline; }
</style>
</head>
<body>
<div class="logo">R</div>
<div class="name">러닝그라운드</div>
<p class="hint">뛸수록 랭크가 오르는 러닝 대결 앱</p>
<a class="button" href="${primaryUrl}">${storeLabel}</a>
${fallbackUrl ? `<a class="fallback" href="${fallbackUrl}">버튼이 안 되면 여기를 눌러 주세요</a>` : ''}
<script>
  setTimeout(function () {
    if (!document.hidden) {
      location.href = ${JSON.stringify(autoUrl)};
    }
  }, 600);
</script>
</body>
</html>`;
}

function buildFriendLandingHtml({ tagCode, storeUrl }) {
  const appLink = `runningground://add-friend?tag=${tagCode}`;

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>러닝그라운드 친구 추가</title>
<style>
  body { margin: 0; font-family: -apple-system, sans-serif; background: #EFF0FA; color: #111827;
         display: flex; flex-direction: column; align-items: center; justify-content: center;
         min-height: 100vh; gap: 14px; padding: 24px; text-align: center; }
  .tag { font-size: 28px; font-weight: 800; color: #6D5EF7; }
  .hint { color: #667085; font-size: 14px; line-height: 1.5; }
  a.button { display: block; width: 100%; max-width: 320px; padding: 14px 0; border-radius: 12px;
             text-decoration: none; font-weight: 700; }
  a.primary { background: #6D5EF7; color: #fff; }
  a.secondary { background: rgba(109, 94, 247, 0.14); color: #4338CA; }
</style>
</head>
<body>
<div class="tag">#${tagCode}</div>
<p class="hint">앱이 설치돼 있으면 자동으로 친구 추가 화면이 열려요.<br>안 열리면 아래 버튼을 눌러주세요.</p>
<a class="button primary" href="${appLink}">앱에서 친구 추가</a>
<a class="button secondary" href="${storeUrl}">앱스토어에서 받기</a>
<script>
  // 설치된 폰: 스킴 이동으로 앱이 뜬다. 미설치: 스킴이 무시되므로 잠시 후 스토어로.
  // 앱이 떠서 페이지가 백그라운드로 가면(hidden) 스토어 폴백을 쏘지 않는다.
  location.href = ${JSON.stringify(appLink)};
  setTimeout(function () {
    if (!document.hidden) {
      location.href = ${JSON.stringify(storeUrl)};
    }
  }, 1800);
</script>
</body>
</html>`;
}

export async function routeDownloadRedirectRequest({ method, pathname, request, response, url }) {
  // HEAD도 허용 — 메신저 링크 미리보기 크롤러가 HEAD로 찔러본다.
  if (pathname !== '/download' || (method !== 'GET' && method !== 'HEAD')) {
    return false;
  }

  const userAgent = String(request.headers['user-agent'] ?? '');
  const isIos = /iPhone|iPad|iPod/i.test(userAgent);
  const isAndroid = !isIos && /Android/i.test(userAgent);
  // itms-apps 스킴은 카톡 인앱 브라우저 전용(웹 스토어를 띄우고 멈추는 문제의 우회).
  // 인스타그램 등 다른 인앱 브라우저는 커스텀 스킴 302를 차단해 "페이지를 열 수
  // 없음"이 된다(2026-08-05 인스타 프로필 링크 실사고) — 그 외 iOS는 전부 https
  // 유니버설 링크로 보내면 사파리/인앱 어디서든 App Store로 자연스럽게 넘어간다.
  const isKakaoInAppBrowser = /KAKAOTALK/i.test(userAgent);
  const storeUrl = isIos
    ? (isKakaoInAppBrowser ? APP_STORE_SCHEME_URL : APP_STORE_WEB_URL)
    : isAndroid
      ? PLAY_STORE_WEB_URL
      : APP_STORE_WEB_URL;
  const tagCode = sanitizeTagCode(url?.searchParams?.get('tag'));

  if (tagCode && method === 'GET') {
    const html = buildFriendLandingHtml({
      tagCode,
      storeUrl,
    });
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(html);
    return true;
  }

  // 모바일은 302 대신 랜딩 HTML: 인앱 브라우저가 자동 이동을 막아도 버튼이 남는다.
  // 카톡은 스킴 302가 실기기 검증된 최단 경로라 유지, 데스크톱은 스토어 웹으로 302.
  if ((isIos || isAndroid) && !isKakaoInAppBrowser && method === 'GET') {
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(buildDownloadLandingHtml({
      primaryUrl: isAndroid ? PLAY_STORE_WEB_URL : APP_STORE_SCHEME_URL,
      fallbackUrl: isAndroid ? null : APP_STORE_WEB_URL,
      autoUrl: isAndroid ? PLAY_STORE_WEB_URL : APP_STORE_WEB_URL,
      storeLabel: isAndroid ? 'Google Play에서 받기' : 'App Store에서 열기',
    }));
    return true;
  }

  response.writeHead(302, {
    Location: storeUrl,
    'Cache-Control': 'no-store',
  });
  response.end();
  return true;
}
