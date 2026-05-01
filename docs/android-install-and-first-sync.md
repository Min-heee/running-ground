# Android Install and First Sync

## 목적
이 문서는 Galaxy 폰에서 `RunningGround` APK를 설치하고, 첫 Health Connect 연동과 첫 기록 가져오기를 5분 안에 끝내기 위한 빠른 순서야.

이 문서는 아래 상황을 기준으로 한다.
- Galaxy 폰 1대
- 가능하면 Galaxy Watch 함께 사용
- 집에 가서 바로 설치하고 확인하고 싶은 상황

## 준비물
- Galaxy 폰
- 가능하면 Galaxy Watch
- Google Play 로그인
- 인터넷 연결

## 1. APK 설치
### 방법 A. 빌드 페이지에서 다운로드
아래 빌드 페이지를 열어.
- [Android preview build](https://expo.dev/accounts/<EXPO_ACCOUNT>/projects/runnigapp/builds/<BUILD_ID>)

상태가 `FINISHED`면 `Download`를 눌러 APK를 받으면 돼.

### 방법 B. 직접 APK 링크 열기
바로 다운로드하려면 이 링크를 열어도 된다.
- [RunningGround Android APK](https://expo.dev/artifacts/eas/<ARTIFACT_ID>.apk)

## 2. 설치 허용
Galaxy에서 처음 APK를 설치하면 보통 아래 순서가 뜬다.

1. `이 출처의 앱 설치 허용`
2. 브라우저 또는 파일 앱에 대해 `허용`
3. 다시 APK 설치 진행

설치가 끝나면 `RunningGround`를 바로 열지 말고, 먼저 아래를 같이 준비하는 편이 좋다.

## 3. Health Connect 준비
Android에서는 기본 허브가 `Health Connect`다.

### 이미 설치돼 있으면
- 열어서 정상 실행만 확인

### 설치 안 돼 있으면
Play Store에서 `Health Connect`를 설치한다.

## 4. Samsung Health / Galaxy Watch 확인
Galaxy Watch를 쓰는 경우 먼저 이것부터 본다.

1. Galaxy Watch로 러닝 1개가 이미 있는지 확인
2. Samsung Health 앱에서 그 러닝이 보이는지 확인
3. Samsung Health와 Health Connect 공유 허용이 켜져 있는지 확인

이 흐름이 먼저 살아 있어야 RunningGround에서 가져오기가 자연스럽다.

## 5. RunningGround 첫 실행
앱을 열면 아래 순서로 보면 된다.

1. 로그인
2. `마이` 또는 연동 관리 진입
3. `Health Connect` 연결
4. 권한 허용
5. 다시 앱으로 복귀

정상이라면 연동 소스 목록에 `Health Connect`가 연결된 상태로 보여야 한다.

## 6. 첫 기록 가져오기
### Samsung Health / Galaxy Watch 기준
1. `기기 기록 가져오기` 또는 `동기화 다시 하기`
2. `내 활동`으로 이동
3. 방금 러닝이 1개만 들어왔는지 확인

통과 기준:
- source가 `Health Connect`
- 중복 없이 1개만 생성

## 7. NRC 확인
NRC를 Galaxy에서 쓰는 경우는 `직접 소스`보다 `브리지 경로`로 보는 편이 좋다.

확인 순서:
1. NRC에서 새 러닝 1개 기록
2. 그 기록이 어디에 반영됐는지 확인
3. RunningGround에서 다시 가져오기
4. `내 활동`에서 1개만 들어왔는지 확인

중요한 점:
- source가 `NRC`, `Strava`, `Health Connect` 중 하나로 보일 수 있음
- 핵심은 `경로가 무엇이든 중복 없이 1개만 남는지`다

## 8. MyNB 확인
MyNB도 Galaxy에서는 `Health Connect 허브 중심`으로 보면 된다.

확인 순서:
1. MyNB에서 러닝 1개 기록
2. Health Connect 또는 기기 허브에 반영 확인
3. RunningGround에서 가져오기
4. `내 활동`에서 1개만 생성됐는지 확인

통과 기준:
- source가 `MyNB` 또는 `Health Connect`
- 같은 러닝이 2개 생기지 않음

## 9. Strava / Garmin direct 확인
직접 소스로 테스트할 때는 아래처럼 본다.

1. Strava 또는 Garmin Connect에 새 러닝 1개 확인
2. RunningGround 연동 소스에서 해당 소스 연결
3. 동기화 실행
4. `내 활동`에서 새 기록 확인
5. 다시 동기화해도 중복 없는지 확인

## 10. 실패하면 바로 볼 것
### 설치가 안 될 때
- 출처 허용이 꺼져 있는지
- 다운로드한 파일이 `.apk`인지

### 기록이 안 들어올 때
- Health Connect 권한이 빠졌는지
- Samsung Health 쪽 기록이 먼저 있는지
- RunningGround에서 해당 소스가 연결된 상태인지

### 기록이 두 개 들어올 때
- 같은 러닝이 여러 소스로 동시에 들어왔는지
- `기록 가져오기`를 여러 번 눌렀는지
- source 표기가 `Health Connect / NRC / MyNB / Strava / Garmin` 중 무엇으로 들어왔는지

## 오늘 집 가서 제일 짧게 볼 순서
1. APK 설치
2. Health Connect 설치/실행
3. RunningGround 로그인
4. Health Connect 연결
5. Galaxy Watch 러닝 1개 가져오기
6. NRC 또는 MyNB 러닝 1개 가져오기
7. `내 활동`에서 중복 없는지 확인

## 같이 열어두면 좋은 문서
- [device-integration-qa-matrix.md](/docs/device-integration-qa-matrix.md)
- [testflight-real-device-qa.md](/docs/testflight-real-device-qa.md)
