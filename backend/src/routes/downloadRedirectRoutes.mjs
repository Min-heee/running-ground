// 앱 다운로드 단축 링크: GET /download[?tag=CODE | ?crew=CODE]
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

// 크루 초대 코드(크루대전, 2026-09-18) — 초대 코드 알파벳(I, O, 0, 1 제외) 6자리만 통과.
// 태그와 마찬가지로 HTML/URL에 그대로 박히므로 화이트리스트가 곧 XSS 차단이다.
function sanitizeCrewCode(rawCode) {
  const code = String(rawCode ?? '').trim().toUpperCase();
  return /^[A-HJ-NP-Z2-9]{6}$/.test(code) ? code : null;
}

// 다운로드 랜딩 = 자체 링크트리 (2026-08-05 안드로이드 정식 출시로 개편): 양대
// 스토어 버튼을 나란히 보여주고 방문자가 고른다 — 링크 하나로 아이폰·갤럭시 커버.
// 사용자 UA에 맞는 스토어가 첫 번째(굵은) 버튼. iOS 버튼은 itms-apps 스킴(302
// 스킴은 인앱 브라우저가 차단하지만 탭 제스처는 허용) + https 보조 링크.
// 자동 이동은 인앱 브라우저(인스타/페북/네이버/라인)가 아닐 때만 — 걔네는 어차피
// 조용히 막아서 의미가 없고, 사파리 등에선 최단 경로가 된다.
function buildDownloadLandingHtml({ iosFirst, autoUrl, iosInAppBrowser }) {
  // iOS 인앱 브라우저(인스타/페북)는 App Store 핸드오프를 통째로 떨궈서 https도
  // itms-apps도 무반응이 된다(2026-08-06 실기기 다수 확인). x-safari-https 스킴은
  // 탭 제스처로 사파리를 "밖에서" 열게 하는 공개된 우회 — 사파리로 나가면 앱스토어
  // 핸드오프가 정상 작동한다. 일반 브라우저에서는 기존 itms-apps가 최단 경로.
  const appStoreButton = `<a class="button" href="${APP_STORE_SCHEME_URL}">App Store에서 받기</a>`;
  const playButton = `<a class="button" href="${PLAY_STORE_WEB_URL}">Google Play에서 받기</a>`;
  // 인스타 iOS 웹뷰는 App Store 핸드오프를 전부 차단하고 우회 스킴도 패치한다.
  // 인스타가 유일하게 못 막는 공식 메뉴(⋯ → 외부 브라우저에서 열기)를 1순위 안내로.
  const inAppGuide = iosInAppBrowser
    ? `<div class="guide"><div class="guide-arrow">오른쪽 위 ⋯ 메뉴 ↗</div>
<div class="guide-title">인스타그램에서는 앱스토어가 바로 안 열려요</div>
<div class="guide-steps"><b>오른쪽 위 ⋯</b> 를 누르고<br><b>'외부 브라우저에서 열기'</b>를 선택해 주세요</div></div>`
    : '';

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
  .hint { color: #667085; font-size: 14px; line-height: 1.5; margin-bottom: 6px; }
  a.button { display: block; width: 100%; max-width: 320px; padding: 15px 0; border-radius: 12px;
             text-decoration: none; font-weight: 700; background: #6D5EF7; color: #fff; font-size: 16px; }
  a.button + a.button { background: rgba(109, 94, 247, 0.14); color: #4338CA; }
  a.fallback { color: #667085; font-size: 13px; text-decoration: underline; }
  .hint2 { color: #98A2B3; font-size: 13px; line-height: 1.5; margin-top: 4px; }
  .guide { background: #fff; border: 2px solid #6D5EF7; border-radius: 16px; padding: 18px 22px;
           max-width: 340px; margin-bottom: 6px; }
  .guide-arrow { color: #6D5EF7; font-size: 13px; font-weight: 800; text-align: right; margin-bottom: 8px; }
  .guide-title { font-size: 15px; font-weight: 800; color: #111827; margin-bottom: 8px; }
  .guide-steps { font-size: 14px; color: #4B5563; line-height: 1.6; }
  .guide-steps b { color: #6D5EF7; }
</style>
</head>
<body>
<div class="logo">R</div>
<div class="name">러닝그라운드</div>
<p class="hint">뛸수록 랭크가 오르는 러닝 대결 앱</p>
${iosInAppBrowser
    ? inAppGuide
    : `${iosFirst ? appStoreButton + '\n' + playButton : playButton + '\n' + appStoreButton}
<a class="fallback" href="${APP_STORE_WEB_URL}">App Store 버튼이 안 되면 여기를 눌러 주세요</a>`}
${autoUrl ? `<script>
  setTimeout(function () {
    if (!document.hidden) {
      location.href = ${JSON.stringify(autoUrl)};
    }
  }, 800);
</script>` : ''}
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

// ?crew=CODE 랜딩: 설치된 폰은 runningground://crew-join?code= 로 앱의 코드 가입 화면이
// (코드가 채워진 채) 열린다 — 자동 가입은 없고 사용자가 미리보기를 보고 '가입하기'를 누른다.
// 미설치면 잠시 후 스토어로. 코드를 크게 보여 줘서 앱을 새로 깐 사람이 손으로 옮겨 적을 수
// 있게 한다(로그아웃 상태로 딥링크를 열면 가입 게이트를 지나며 코드가 사라진다).
function buildCrewLandingHtml({ crewCode, storeUrl }) {
  const appLink = `runningground://crew-join?code=${crewCode}`;

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>러닝그라운드 크루 초대</title>
<style>
  body { margin: 0; font-family: -apple-system, sans-serif; background: #EFF0FA; color: #111827;
         display: flex; flex-direction: column; align-items: center; justify-content: center;
         min-height: 100vh; gap: 14px; padding: 24px; text-align: center; }
  .label { color: #667085; font-size: 14px; font-weight: 700; }
  .code { font-size: 34px; font-weight: 800; letter-spacing: 6px; color: #6D5EF7; }
  .hint { color: #667085; font-size: 14px; line-height: 1.5; }
  a.button { display: block; width: 100%; max-width: 320px; padding: 14px 0; border-radius: 12px;
             text-decoration: none; font-weight: 700; }
  a.primary { background: #6D5EF7; color: #fff; }
  a.secondary { background: rgba(109, 94, 247, 0.14); color: #4338CA; }
</style>
</head>
<body>
<div class="label">크루 초대 코드</div>
<div class="code">${crewCode}</div>
<p class="hint">앱이 설치돼 있으면 크루 가입 화면이 열려요.<br>앱을 새로 받았다면 크루 탭에서 이 코드를 입력해 주세요.</p>
<a class="button primary" href="${appLink}">앱에서 크루 가입</a>
<a class="button secondary" href="${storeUrl}">앱 받기</a>
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

  const crewCode = sanitizeCrewCode(url?.searchParams?.get('crew'));

  if (crewCode && method === 'GET') {
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(buildCrewLandingHtml({ crewCode, storeUrl }));
    return true;
  }

  // 카톡만 스킴 302 유지(실기기 검증된 최단 경로) — 그 외에는 전부 양대 스토어
  // 버튼 랜딩. 자동 이동은 인앱 브라우저가 아닐 때만 붙인다.
  if (!isKakaoInAppBrowser && method === 'GET') {
    const isInAppBrowser = /Instagram|FBAN|FBAV|NAVER|Line\//i.test(userAgent);
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(buildDownloadLandingHtml({
      iosFirst: !isAndroid,
      autoUrl: isInAppBrowser ? null : (isAndroid ? PLAY_STORE_WEB_URL : APP_STORE_WEB_URL),
      iosInAppBrowser: isIos && isInAppBrowser,
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
