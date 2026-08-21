// Google Play 명시적 공개(Prominent Disclosure) 문구 — 2026-08-05 정책 거절 대응.
// 요건(사용자 데이터 정책): 앱 이름 명시 + 수집 데이터 종류 + 사용 목적 + 백그라운드
// 수집 사실을 앱 안에서, 런타임 권한 요청 "직전"에 보여주고 명시적 동의를 받아야 한다.
// 이 카피는 계약 테스트(locationDisclosureCopy.test.ts)가 요건 문구를 고정한다.
// 런타임(Alert/저장)은 locationDisclosure.ts — react-native 의존이라 분리했다.

export const LOCATION_DISCLOSURE_TITLE = '위치 정보 수집 안내';

export const LOCATION_DISCLOSURE_MESSAGE = [
  '러닝스페이스는 러닝 경로·거리·페이스 측정, 실시간 대결 진행, 친구 라이브 응원 기능을 제공하기 위해 위치 데이터를 수집합니다.',
  '러닝을 측정하는 동안에는 앱을 사용하지 않거나 화면이 꺼져 있을 때(백그라운드)에도 위치 데이터가 수집됩니다.',
  '수집된 위치 데이터는 위 기능을 제공하는 데에만 사용되며, 광고 목적으로 제3자에게 제공되지 않습니다.',
].join('\n\n');

export const LOCATION_DISCLOSURE_AGREE_LABEL = '동의';
export const LOCATION_DISCLOSURE_DECLINE_LABEL = '동의하지 않음';
