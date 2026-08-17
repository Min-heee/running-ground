// 이 바이너리의 네이티브 거리 누적기가 신호 끊김 갭 규칙(maxCreditableFixGapMs)을 읽는가.
//
// 네이티브 누적 거리를 **믿어도 되는지**를 가르는 단 하나의 기준이다. 갭 규칙이 없는 누적기는
// GPS 블랙아웃(터널·지하철)의 직선거리를 그럴듯한 속도로 통째로 적립하고, 서버는
// Math.max라 그 부풀림을 영영 되돌리지 못한다. 그래서 네이티브 값을 소비하는 모든 경로
// (신선도 갭필, 깨어날 때의 화면꺼짐 크레딧)는 이 판별을 통과해야만 열린다.
//
// 원래 계획은 "갭 규칙 빌드가 **최소** 배포 버전이 되면 전역 플래그를 켠다"였지만, 앱에는
// 최소 버전 강제가 없어 옛 설치가 남아 있는 한 그 날은 오지 않는다. 기기별로 판별하면
// 조건이 함대가 아니라 **그 폰**에 대한 것이 된다: 새 바이너리는 오늘 고쳐지고, 옛
// 바이너리는 오늘과 똑같이(더 나빠지지 않게) 동작한다.
//
// 판별은 바이너리의 빌드 번호로 한다. OTA 번들의 app.json이 아니라 **설치된 바이너리**의
// 값이어야 한다 — OTA는 모든 구버전에도 내려가므로 번들 쪽 숫자는 언제나 최신을 말한다.

// 갭 규칙(커밋 bfc54ec6, 2026-08-10)을 담은 첫 바이너리.
//  - iOS: buildNumber 55 (EAS 빌드가 정확히 그 커밋에서 만들어졌음을 확인).
//  - Android: versionCode 44 — 갭 규칙 커밋 뒤에야 44로 올랐으므로(6816128d) 44 미만에
//    갭 규칙 바이너리는 존재하지 않고, 44 이상이 그 이전 커밋에서 나올 수도 없다.
export const NATIVE_GAP_RULE_MIN_BUILD = {
  ios: 55,
  android: 44,
} as const;

// 순수 판별 — react-native를 모르므로 노드 테스트가 그대로 돈다. 호출자는 플랫폼과
// 바이너리 빌드 번호(Constants.nativeBuildVersion)를 넘긴다.
//
// 판별 불가(빌드 번호 없음·숫자 아님·미지의 플랫폼)는 전부 **false**다 — 이 신호가 여는
// 것은 부정 적립 가능성이 있는 경로라, 모르면 닫는 쪽이 안전하다(fail-closed).
export function resolveNativeGapRuleBinary(
  platform: string,
  nativeBuildVersion: string | number | null | undefined,
): boolean {
  const parsed = typeof nativeBuildVersion === 'number'
    ? nativeBuildVersion
    : Number.parseInt(String(nativeBuildVersion ?? ''), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return false;
  }

  if (platform === 'ios') {
    return parsed >= NATIVE_GAP_RULE_MIN_BUILD.ios;
  }

  if (platform === 'android') {
    return parsed >= NATIVE_GAP_RULE_MIN_BUILD.android;
  }

  return false;
}
