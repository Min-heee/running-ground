// 앱 사용설명 투어 (오너 2026-08-06): 홈 헤더 ? 버튼 → 탭을 돌며 중요 버튼에
// 말풍선 설명. 스텝 정의는 RN 무의존 순수 데이터 — 계약 테스트가 카피를 고정한다.
// targetId 는 TourTarget 으로 감싼 실제 UI 와 1:1 대응한다. 타깃이 화면에 없으면
// (예: 러닝 탭이 혼자가 아닌 세그먼트에 있을 때) 오버레이가 스포트라이트 없이
// 가운데 말풍선으로 대체한다 — 투어가 절대 막히지 않는 안전망.

export type TourStep = {
  id: string;
  route: string;
  targetId: string;
  title: string;
  body: string;
};

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'league-modes',
    route: '/(tabs)/league',
    targetId: 'league-modes',
    title: '랭킹 탭',
    body: '랭킹은 세 가지예요. 지역은 우리 동네 순위, 랭크는 LP 순위, 오늘은 오늘 가장 많이 뛴 러너!',
  },
  {
    id: 'running-modes',
    route: '/(tabs)/running',
    targetId: 'running-modes',
    title: '러닝 탭',
    body: '러닝은 혼자 · 매칭 · 파티런 세 가지 모드가 있어요. 하나씩 볼게요.',
  },
  {
    id: 'solo-run',
    route: '/(tabs)/running',
    targetId: 'solo-run',
    title: '혼자 러닝',
    body: '목표 거리를 정하고 RUN! 달리는 동안 뛴 만큼 링이 채워져요.',
  },
  {
    id: 'solo-tools',
    route: '/(tabs)/running',
    targetId: 'solo-tools',
    title: '페이스메이커 · 자신과 대결',
    body: '페이스메이커는 목표 페이스를 음성으로 잡아주는 러닝 도우미, VS ME는 과거의 나와 겨루는 대결이에요.',
  },
  {
    id: 'matching',
    route: '/(tabs)/running',
    targetId: 'running-modes',
    title: '매칭',
    body: '매칭은 전국 러너와 실시간 대결이에요. 이기면 LP를 얻고 랭크가 올라가요!',
  },
  {
    id: 'party-run',
    route: '/(tabs)/running',
    targetId: 'running-modes',
    title: '파티런',
    body: '파티런은 초대 코드 하나로 친구와 같은 방에서 동시 스타트 — 멀리 있어도 함께 달려요.',
  },
  {
    id: 'friends',
    route: '/(tabs)/friends',
    targetId: 'friends-add',
    title: '친구',
    body: '여기서 내 태그를 공유해 친구를 추가해요. 친구와 랭킹을 겨루고, 달리는 친구에겐 실시간 응원도 보낼 수 있어요.',
  },
  {
    id: 'home-rank',
    route: '/(tabs)/home',
    targetId: 'home-rank',
    title: '내 랭크',
    body: '대결에서 이기면 LP가 쌓여 입문부터 엘리트까지 올라가요. 전적도 여기서 확인! 이제 달려볼까요?',
  },
] as const;
