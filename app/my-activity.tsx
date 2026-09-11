import { Redirect } from 'expo-router';

// '내 활동'은 기록 탭(/(tabs)/records)으로 옮겼다 (오너 2026-09-11). 이 경로는 예전
// 딥링크·저장된 링크가 죽지 않도록 남겨둔 얇은 리다이렉트다 — 앱 안의 이동은 전부
// /(tabs)/records 를 직접 가리킨다.
export default function MyActivityRedirect() {
  return <Redirect href="/(tabs)/records" />;
}
