# 프론트엔드 API 에러 처리 규칙

## 목적

프론트엔드의 API 실패 처리를 `src/services/apiClient.ts` 기준으로 통일합니다. 화면과 훅은 API 실패 원인을 직접 해석하지 않고, 서비스 레이어가 만든 `ApiError`와 `getApiErrorMessage`를 통해 사용자에게 보여줄 메시지만 받습니다. `ApiError` 타입과 메시지 helper는 순수 로직 테스트에서도 쓸 수 있도록 React Native 의존이 없는 `src/services/apiError.ts`에 둡니다.

## 공통 진입점

- 앱 코드에서 직접 `fetch`를 호출하지 않습니다.
- 네트워크 요청은 `src/services/apiClient.ts`의 `apiGet`, `apiPost`, `apiPatch`, `apiDelete`, `apiRequest`를 통해 실행합니다.
- 기능별 서비스는 `src/services/*Service.ts` 또는 `src/lib/api/services/*`에서 API 경로와 요청/응답 타입을 관리합니다.
- 화면과 훅은 서비스 함수만 호출하고 API 경로 문자열을 직접 다루지 않습니다.

## 에러 분류

`ApiError.kind`는 다음 기준으로 구분합니다.

- `network`: 서버 연결 실패, 기기 네트워크 실패, 공개 터널 연결 실패
- `timeout`: API 요청 제한 시간 초과
- `auth`: `401`, `403` 인증/권한 오류
- `server`: `500` 이상 서버 오류
- `request`: `400`대 요청 오류
- `empty`: 성공 응답이지만 본문이 비어 있는 경우
- `invalid-json`: JSON이 아닌 응답 또는 JSON 파싱 실패
- `unknown`: 예비 분류

## 화면 메시지 규칙

- 화면과 훅의 `catch`에서는 `getApiErrorMessage(error, fallbackMessage)`를 사용합니다.
- `fallbackMessage`는 기존 화면 문구를 유지해 UI/UX가 바뀌지 않도록 합니다.
- `ApiError.userMessage`가 있으면 서버/클라이언트에서 정리한 메시지를 우선 보여줍니다.
- 일반 `Error`가 들어온 경우에도 기존 동작처럼 `error.message`를 보여줍니다.
- 알 수 없는 값은 화면별 fallback 메시지로 처리합니다.

## 응답 타입 규칙

- `apiRequest<T>`는 제네릭 타입 `T`로 응답 타입을 고정합니다.
- 서비스 함수는 `RunningMatchStatusResponse`, `MyProfileResponse`, `RegionLeagueResponse`처럼 API 계약 타입 또는 domain 타입을 반환합니다.
- 화면 컴포넌트는 응답 구조를 직접 추론하지 않고 서비스 함수의 반환 타입에 의존합니다.

## 금지 패턴

```ts
fetch('/api/...')
```

```ts
catch (error) {
  setError(error instanceof Error ? error.message : '실패했어.');
}
```

```ts
catch (error) {
  console.error(error);
}
```

## 권장 패턴

```ts
import { getApiErrorMessage } from '@/services';

try {
  await fetchMyProfile();
} catch (error) {
  setError(getApiErrorMessage(error, '프로필을 불러오지 못했어.'));
}
```

## 이번 정리에서 적용한 파일

- `src/services/apiError.ts`: `ApiError`, `ApiErrorKind`, `isApiError`, `getApiErrorMessage` 추가
- `src/services/apiClient.ts`: HTTP 실패를 `ApiError`로 변환하고 공통 helper 재수출
- `src/services/index.ts`: 공통 API 클라이언트와 에러 helper 재수출
- `src/lib/api/client.ts`: 기존 `@/lib/api/client` 경로에서도 에러 helper 사용 가능하게 재수출
- `src/lib/api/services/mock/rooms.ts`: 방 API fallback 판단을 `ApiError` 상태값과 호환되게 보강
- `src/features/**`: API 호출 실패 메시지를 `getApiErrorMessage` 기준으로 통일

## 출시 전 확인

아래 명령어가 통과해야 합니다.

```bash
npm run typecheck
npm run lint
npm run test
git diff --check
```
