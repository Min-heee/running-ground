import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 개인정보처리방침 정적 서빙 — 스토어 심사(App Store 5.1.1(i), Play Data safety,
// Health Connect rationale)가 요구하는 공개 URL을 별도 호스팅/DNS 없이 이미 살아있는
// api.running-ground.com 에서 바로 제공한다. Caddy가 모든 경로를 이 서버로 넘기므로
// /privacy 와 /privacy-policy 둘 다 여기서 응답한다 (앱/매니페스트가 두 경로를
// 혼용해온 이력이 있어 양쪽 모두 지원).
//
// 편집은 저장소 루트의 docs/privacy-policy.html(원본)에서 하고 이 사본으로 복사한다 —
// docker 빌드 컨텍스트가 backend/ 뿐이라 런타임에 docs/ 를 읽을 수 없다.
//   cp docs/privacy-policy.html backend/src/assets/privacyPolicy.html

const hereDirectory = dirname(fileURLToPath(import.meta.url));
const PRIVACY_POLICY_HTML = readFileSync(
  join(hereDirectory, '../assets/privacyPolicy.html'),
  'utf8',
);
const PRIVACY_POLICY_PATHS = new Set(['/privacy', '/privacy-policy']);

export function routeLegalRequest({ pathname, method, response }) {
  if (!PRIVACY_POLICY_PATHS.has(pathname)) {
    return false;
  }

  if (method !== 'GET' && method !== 'HEAD') {
    return false;
  }

  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'public, max-age=3600',
  });
  response.end(method === 'HEAD' ? undefined : PRIVACY_POLICY_HTML);
  return true;
}
