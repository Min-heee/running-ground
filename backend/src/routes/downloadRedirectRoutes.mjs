// 앱 다운로드 단축 링크: GET /download
//
// 태그 공유 메시지의 apps.apple.com 링크는 카톡 등 메신저의 인앱 브라우저에서
// 웹 스토어 페이지를 먼저 띄워 "바로 안 열리는" 경험이 된다. 우리 도메인을
// 링크로 쓰고 iOS UA에는 itms-apps:// 스킴으로 302를 쏘면 인앱 브라우저도
// App Store 앱으로 즉시 넘어간다 (국내 서비스 공통 패턴). 그 외 UA(데스크톱,
// 안드로이드)는 https 스토어 페이지로. 안드로이드 정식 출시 후 Play 분기 추가.
const APP_STORE_WEB_URL = 'https://apps.apple.com/kr/app/id6762328694';
const APP_STORE_SCHEME_URL = 'itms-apps://apps.apple.com/kr/app/id6762328694';

export async function routeDownloadRedirectRequest({ method, pathname, request, response }) {
  // HEAD도 허용 — 메신저 링크 미리보기 크롤러가 HEAD로 찔러본다.
  if (pathname !== '/download' || (method !== 'GET' && method !== 'HEAD')) {
    return false;
  }

  const userAgent = String(request.headers['user-agent'] ?? '');
  const isIos = /iPhone|iPad|iPod/i.test(userAgent);

  response.writeHead(302, {
    Location: isIos ? APP_STORE_SCHEME_URL : APP_STORE_WEB_URL,
    'Cache-Control': 'no-store',
  });
  response.end();
  return true;
}
