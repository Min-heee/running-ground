# Screen Responsibility Audit

작성일: 2026-05-13

이번 문서는 코드 수정 없이 화면별 책임 분리 상태를 점검한 결과다. 기준은 `app/**`, `src/features/*/screens/**`, `src/features/*/components/**`, `src/components/**`, `src/services/**` 구조다.

## 요약

- `app/` 라우트 파일은 대부분 thin re-export 구조로 잘 정리되어 있다.
- 실제 화면 구현은 대부분 `src/features/*/screens` 아래에 위치한다.
- 공통 UI는 `src/components`, 기능 전용 UI는 `src/features/*/components`에 상당 부분 분리되어 있다.
- 남은 핵심 과제는 screen 파일 내부에 남아 있는 API 호출, form/action 상태, 계산 로직을 hooks/utils/components로 더 빼는 것이다.
- 특히 `AdminScreen`, `SignupFormScreen`, integrations 화면 3개, friends/profile/running 설정성 화면들이 다음 리팩토링 후보이다.

## 2026-05-13 리팩토링 반영 메모

- `AdminScreen`의 관리자 로그인, 대시보드 로드, CRUD 액션, 검색/필터 계산을 `useAdminDashboard`와 admin utils로 분리했다.
- `SignupFormScreen`의 회원가입 폼 상태, 지역 선택, 아이디 중복 확인, 가입 요청 흐름을 `useSignupForm`으로 분리했다.
- `UniversityVerificationScreen`, `LoginScreen`의 데이터 로드/검증/액션 상태를 auth hooks로 분리했다.
- integrations, friends, profile, running, match, settings, league 일부 화면의 service 호출과 계산 로직을 각 feature hook/utils로 이동했다.
- 화면 파일은 기존 UI와 라우트를 유지하면서 데이터 연결과 레이아웃 조립에 더 가깝게 정리했다.

## 1. app/ 라우트 책임 점검

| 상태 | 파일 | 판단 | 메모 |
|---|---|---|---|
| OK | `app/account-recovery.tsx` 등 대부분의 leaf route | `export { default } from '@/features/.../screens/...'` 형태 | 라우트 주소를 유지하면서 실제 구현을 features로 위임한다. |
| OK | `app/(tabs)/home.tsx`, `app/(tabs)/running.tsx` 등 tab route | thin re-export | tab route 주소와 화면 구현이 분리되어 있다. |
| OK/예외 | `app/index.tsx` | 6줄 Redirect | 루트 진입점으로서 최소 책임만 가진다. |
| OK/예외 | `app/_layout.tsx` | auth gate, session hydrate, notification handler, stack 선언 포함 | Expo Router layout 특성상 예외로 볼 수 있으나, 더 엄격히 보면 `useRootAuthGate` 같은 hook으로 분리 가능하다. |
| OK/예외 | `app/(tabs)/_layout.tsx` | tab layout, icon/title 설정 포함 | 라우팅 layout 책임에 가깝다. 다만 tab constants/icons는 `src/navigation/tabs.ts`로 분리 가능하다. |

### 결론

`app/`는 라우팅 진입점 역할을 거의 만족한다. 지금 당장 기능 위험을 감수하며 손볼 필요는 낮다. 다음 개선은 `_layout` 내부 auth/notification/tab 설정을 hook/config로 빼는 정도가 적당하다.

## 2. 실제 화면 구현 위치 점검

| 상태 | 영역 | 판단 |
|---|---|---|
| OK | auth | `src/features/auth/screens/**`에 화면 구현이 있다. |
| OK | running | `src/features/running/screens/**`, 실제 러닝 경험은 `src/features/runs/**`로 연결된다. |
| OK | match | `src/features/match/screens/**`에 race, room, record 화면이 있다. |
| OK | friends | `src/features/friends/screens/**`에 화면 구현이 있다. |
| OK | league | `src/features/league/screens/**`에 화면 구현이 있다. |
| OK | market | `src/features/market/screens/**`에 화면 구현이 있다. |
| OK | profile | `src/features/profile/screens/**`에 화면 구현이 있다. |
| OK | integrations | `src/features/integrations/screens/**`에 화면 구현이 있다. |
| OK | settings | `src/features/settings/screens/**`에 admin/notification/region 화면이 있다. |
| OK | home | `src/features/home/screens/HomeScreen.tsx`와 `src/features/home/HomeOverview.tsx`로 구현되어 있다. 최근 홈 overview는 카드/훅/유틸로 분리되어 책임이 좋아졌다. |

## 3. Screen 내부 API 호출 점검

아래 화면은 서비스 계층은 사용하고 있지만, screen 컴포넌트 내부에서 직접 service 호출과 async action을 관리한다. 출시 전 코드 품질 기준으로는 hooks 또는 controller로 빼는 것이 좋다.

| 우선순위 | 파일 | 발견 내용 | 권장 분리 위치 |
|---|---|---|---|
| High | `src/features/settings/screens/AdminScreen.tsx` | admin service 호출 50개 이상, CRUD action, filter/form 상태가 한 화면에 집중 | `src/features/settings/admin/hooks/useAdminDashboard.ts`, `src/features/settings/admin/components/**` |
| High | `src/features/auth/screens/SignupFormScreen.tsx` | `fetchRegionCatalog`, `checkUsernameAvailability`, `registerAccount` 흐름과 지역 선택/form 검증이 화면에 직접 있음 | `src/features/auth/hooks/useSignupForm.ts`, `src/features/auth/components/signup/**` |
| High | `src/features/integrations/screens/IntegrationManagementScreen.tsx` | `fetchIntegrationStatus`, sync/connect/import action이 화면 내부에 있음 | `src/features/integrations/hooks/useIntegrationManagement.ts` |
| High | `src/features/integrations/screens/IntegrationsScreen.tsx` | integration load/sync/connect/device import action이 화면 내부에 있음 | `src/features/integrations/hooks/useIntegrationsScreen.ts` |
| Medium | `src/features/integrations/screens/ConnectSourcesScreen.tsx` | source connect 및 status refresh가 화면 내부에 있음 | `src/features/integrations/hooks/useConnectSources.ts` |
| Medium | `src/features/friends/screens/FriendsScreen.tsx` | friend leaderboard/profile/request action이 화면 내부에 있음 | `src/features/friends/hooks/useFriendsScreen.ts` |
| Medium | `src/features/friends/screens/AddFriendScreen.tsx` | profile/leaderboard load와 friend request submit이 화면 내부에 있음 | `src/features/friends/hooks/useAddFriendScreen.ts` |
| Medium | `src/features/friends/screens/FriendDetailScreen.tsx` | friend activity load와 refresh 상태가 화면 내부에 있음 | `src/features/friends/hooks/useFriendDetail.ts` |
| Medium | `src/features/profile/screens/MyPageScreen.tsx` | profile/integration/activity load와 logout/delete action이 화면 내부에 있음 | `src/features/profile/hooks/useMyPageScreen.ts` |
| Medium | `src/features/profile/screens/EditProfileScreen.tsx` | profile load/update action이 화면 내부에 있음 | `src/features/profile/hooks/useEditProfile.ts` |
| Medium | `src/features/profile/screens/MyActivityScreen.tsx` | activity load가 화면 내부에 있음 | `src/features/profile/hooks/useMyActivity.ts` |
| Medium | `src/features/match/screens/MatchRecordScreen.tsx` | activity load와 match record filtering/stat 계산이 화면 내부에 있음 | `src/features/match/hooks/useMatchRecords.ts`, `src/features/match/utils/matchRecordStats.ts` |
| Medium | `src/features/running/screens/AddRunScreen.tsx` | manual run submit과 form 상태가 화면 내부에 있음 | `src/features/running/hooks/useAddRunForm.ts` |
| Medium | `src/features/running/screens/RunDetailScreen.tsx` | run detail fetch와 map route 계산이 화면 내부에 있음 | `src/features/running/hooks/useRunDetail.ts`, `src/features/running/utils/runMap.ts` |
| Medium | `src/features/settings/screens/NotificationSettingsScreen.tsx` | notification settings load/save와 reminder sync가 화면 내부에 있음 | `src/features/settings/hooks/useNotificationSettings.ts` |
| Medium | `src/features/settings/screens/RegionSettingsScreen.tsx` | profile/catalog load, region selection, save가 화면 내부에 있음 | `src/features/settings/hooks/useRegionSettings.ts` |
| Low | `src/features/league/screens/DistrictPersonalScreen.tsx` | district personal fetch가 화면 내부에 있음. UI는 비교적 잘게 나뉨 | `src/features/league/hooks/useDistrictPersonal.ts` |

## 4. Screen 내부 계산 로직 점검

| 우선순위 | 파일 | 발견 내용 | 권장 분리 위치 |
|---|---|---|---|
| High | `src/features/settings/screens/AdminScreen.tsx` | notices/users/market/redemptions/races filter 로직과 list map 렌더링이 화면 내부에 많다. | `src/features/settings/admin/utils/adminFilters.ts`, list components |
| High | `src/features/auth/screens/SignupFormScreen.tsx` | username/password/phone/region 검증과 단계별 지역 선택 계산이 화면에 남아 있다. | `src/features/auth/utils/signupValidation.ts`, `useSignupForm.ts` |
| Medium | `src/features/auth/screens/UniversityVerificationScreen.tsx` | university filtering, method step/checklist 렌더링이 화면 내부에 있다. | `src/features/auth/utils/universityVerification.ts`, components |
| Medium | `src/features/match/screens/MatchRecordScreen.tsx` | matchRuns, duel/group 분류, 승/패/무/포디움 통계가 화면 내부에 있다. | `src/features/match/utils/matchRecordStats.ts` |
| Medium | `src/features/profile/screens/MyPageScreen.tsx` | matchRuns/duel/group summary와 connected source count가 화면 내부에 있다. | `src/features/profile/utils/profileSummary.ts` |
| Medium | `src/features/friends/screens/FriendsScreen.tsx` | pending/received request 분류와 compare target 계산이 화면 내부에 있다. | `src/features/friends/utils/friendScreenModel.ts` |
| Medium | `src/features/running/screens/RunDetailScreen.tsx` | route coordinates/map region 계산이 화면 내부에 있다. | `src/features/running/utils/runRouteMap.ts` |
| Low | `src/features/home/screens/HomeScreen.tsx` | notice `.map` 정도만 남아 있음 | 현재 상태 유지 가능 |

## 5. 공통 UI 분리 상태

| 상태 | 위치 | 판단 |
|---|---|---|
| OK | `src/components/Card.tsx`, `Screen.tsx`, `SectionTitle.tsx` | 기본 화면/카드 구조가 공통화되어 있다. |
| OK | `src/components/ui/**` | `AuthHeader`, `Button`, `InfoCard`, `ListRow`, `PageHeader`, `PrimaryButton`, `SecondaryButton`, `StateMessageCard`가 공통 UI 역할을 한다. |
| OK | `src/components/ranking/RankingItemRow.tsx` | 랭킹 row 공통화가 시작되어 있다. |
| OK | `src/components/matches/**` | 라이브 대결 arena/race board는 여러 기능에서 재사용 가능한 위치에 있다. |
| 개선 후보 | settings/admin 화면 내부 button/list/form | admin 전용 컴포넌트가 screen 내부에 많이 남아 있다. 공통 UI보다는 `src/features/settings/admin/components/**`가 적합하다. |
| 개선 후보 | auth form input/section 패턴 | signup/login/recovery에서 비슷한 input/section 패턴이 반복된다. `src/features/auth/components/forms/**` 또는 공통 form component 후보이다. |

## 6. 기능 전용 UI 분리 상태

| 상태 | 기능 | 판단 |
|---|---|---|
| Good | home | `HomeHeader`, `HomeNoticeCard`, `HomeUpcomingMatchesCard`, overview 카드들이 분리되어 있다. |
| Good | league | hero, switch, ranking, region selector, coming soon card가 분리되어 있다. |
| Good | profile | profile summary, settings, match record summary, account actions가 분리되어 있다. |
| Good | running/runs | match setup, party run, live match, room cards가 많이 분리되어 있다. |
| Good | integrations | source cards, result card, native diagnostic card가 분리되어 있다. |
| Medium | friends | list/request/tag card는 분리되어 있으나 screen model과 detail/activity row 분리가 더 필요하다. |
| Medium | auth | 큰 signup/university/recovery 화면에서 기능 전용 components가 더 필요하다. |
| Needs work | settings/admin | admin 전용 components/hooks/utils 구조가 거의 부족하다. |

## 7. 우선순위별 제안

### High

1. `src/features/settings/screens/AdminScreen.tsx`
   - 이유: 1550줄, API 호출/상태/form/filter/list render가 모두 한 파일에 있다.
   - 제안: `src/features/settings/admin/hooks/useAdminDashboard.ts`, `components/AdminOverviewPanel.tsx`, `AdminNoticeSection.tsx`, `AdminMarketSection.tsx`, `AdminRaceSection.tsx`, `utils/adminFilters.ts`로 나눈다.

2. `src/features/auth/screens/SignupFormScreen.tsx`
   - 이유: 933줄, 회원가입 form 상태/검증/지역 선택/API 호출이 화면에 집중되어 있다.
   - 제안: `useSignupForm`, `SignupIdentitySection`, `SignupRegionSection`, `SignupPasswordSection`, `signupValidation.ts`로 분리한다.

3. `src/features/integrations/screens/IntegrationManagementScreen.tsx` + `IntegrationsScreen.tsx` + `ConnectSourcesScreen.tsx`
   - 이유: source connect/sync/import/status refresh 패턴이 3개 화면에 반복된다.
   - 제안: `useIntegrationStatus`, `useIntegrationActions`, `useNativeImportAction`으로 묶는다.

### Medium

4. `src/features/friends/screens/FriendsScreen.tsx`, `AddFriendScreen.tsx`, `FriendDetailScreen.tsx`
   - 이유: service 호출과 request 분류/상태가 화면에 남아 있다.
   - 제안: `useFriendsScreen`, `useAddFriendScreen`, `useFriendDetail`, `friendScreenModel.ts`.

5. `src/features/match/screens/MatchRecordScreen.tsx`
   - 이유: 전적 필터/통계 계산이 화면에 있다.
   - 제안: `useMatchRecords`, `matchRecordStats.ts`.

6. `src/features/running/screens/AddRunScreen.tsx`, `RunDetailScreen.tsx`
   - 이유: form submit과 route/map 계산이 화면에 있다.
   - 제안: `useAddRunForm`, `useRunDetail`, `runRouteMap.ts`.

7. `src/features/profile/screens/MyPageScreen.tsx`, `EditProfileScreen.tsx`, `MyActivityScreen.tsx`
   - 이유: 프로필/활동 load와 action 상태가 화면에 있다.
   - 제안: `useMyPageScreen`, `useEditProfile`, `useMyActivity`.

8. `app/_layout.tsx`
   - 이유: session hydrate/auth redirect/notification handler가 layout에 있다.
   - 제안: 기능 변경 없이 `src/features/auth/hooks/useRootAuthGate.ts`와 `src/features/settings/notifications/configureNotificationHandler.ts`로 분리 가능하다.

### Low

9. `app/(tabs)/_layout.tsx`
   - 이유: tab title/icon/style 상수가 layout에 있다.
   - 제안: `src/navigation/tabConfig.ts`로 분리하면 라우트 파일이 더 얇아진다.

10. `src/features/home/screens/HomeScreen.tsx`
    - 이유: 최근 분리 후 73줄, 화면 조립 책임만 남은 편이다.
    - 제안: 현재 상태 유지. notice list가 커지면 `HomeNoticeList` 정도만 추가한다.

## 다음 작업 추천 순서

1. `AdminScreen`은 가장 크지만 영향 범위가 넓으므로, 먼저 `adminFilters.ts`와 admin section 컴포넌트부터 한 조각씩 분리한다.
2. 사용자 기능 쪽 안정성을 우선하면 `SignupFormScreen`의 validation/form hook 분리를 먼저 한다.
3. 중복 제거 효과를 우선하면 integration 3개 화면의 status/action hook 통합을 먼저 한다.
4. 화면 책임 원칙을 계속 밀려면 `FriendsScreen`, `MatchRecordScreen`, `RunDetailScreen`처럼 200줄 안팎 screen을 hook + utils로 얇게 만든다.

## 결론

라우팅과 화면 위치 구조는 전반적으로 잘 잡혀 있다. 지금 부족한 부분은 “screen 파일이 아직 데이터를 직접 부르고 계산까지 한다”는 점이다. 다음 리팩토링은 UI를 바꾸지 않고 screen에서 service 호출과 계산 로직을 hooks/utils로 이동하는 방향이 가장 안전하다.
