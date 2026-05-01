# Device Integration QA Matrix

## 목적
이 문서는 `RunningGround`에서 실제 기기 조합별 연동을 검증할 때 쓰는 실전 체크리스트야.

지금 목표는 세 가지다.
- iPhone + Apple Watch 사용자 흐름이 Apple Health 중심으로 자연스럽게 동작하는지 확인
- Galaxy + Galaxy Watch 사용자 흐름이 Health Connect 중심으로 자연스럽게 동작하는지 확인
- NRC, MyNB, Strava, Garmin 조합이 실제로 어떤 경로로 앱에 들어오는지 헷갈리지 않게 정리

## 현재 지원 전략 한 줄 요약
### iPhone / Apple Watch
- 기본 허브: `Apple Health`
- `NRC`, `MyNB`: Apple Health에 기록이 들어온 뒤 RunningGround가 읽어오는 흐름
- `Strava`, `Garmin`: 직접 소스로 연결 가능

### Galaxy / Galaxy Watch
- 기본 허브: `Health Connect`
- `NRC`, `MyNB`: Health Connect 또는 파트너 소스 경유 흐름
- `Strava`, `Garmin`: 직접 소스로 연결 가능

## 테스트 우선순위
시간이 부족하면 아래 순서대로만 먼저 본다.

1. iPhone + Apple Watch + NRC
2. iPhone + Apple Watch + MyNB
3. Galaxy + Galaxy Watch + Health Connect
4. Galaxy + Galaxy Watch + NRC
5. Galaxy + Galaxy Watch + MyNB
6. Strava direct
7. Garmin direct

## 조합별 기대 경로
| 기기 | 러닝 앱/기기 | 기대 경로 | RunningGround에서 기대 source |
| --- | --- | --- | --- |
| iPhone + Apple Watch | NRC | NRC -> Apple Health -> RunningGround | `NRC` 또는 `apple_health / NRC` |
| iPhone + Apple Watch | MyNB | MyNB -> Apple Health -> RunningGround | `MyNB` 또는 `apple_health / MyNB` |
| iPhone + Apple Watch | Strava | Strava -> RunningGround direct | `Strava` |
| iPhone + Apple Watch | Garmin | Garmin Connect -> RunningGround direct | `Garmin` |
| Galaxy + Galaxy Watch | Samsung Health only | Samsung Health -> Health Connect -> RunningGround | `Health Connect` |
| Galaxy + Galaxy Watch | NRC | NRC -> Partner or Health Connect path -> RunningGround | `NRC`, `Strava`, `Health Connect` 중 실제 연결 경로 기준 |
| Galaxy + Galaxy Watch | MyNB | MyNB -> Health Connect path -> RunningGround | `MyNB` 또는 `Health Connect` |
| Galaxy + Galaxy Watch | Strava | Strava -> RunningGround direct | `Strava` |
| Galaxy + Galaxy Watch | Garmin | Garmin Connect -> RunningGround direct | `Garmin` |

## 공통 통과 기준
모든 조합에서 아래가 맞아야 통과로 본다.

- 러닝 1개가 `중복 없이 1개`만 들어온다
- `내 활동`과 `기록 상세`에서 source 표기가 납득 가능하다
- `기록 가져오기`를 다시 눌렀을 때 이미 들어온 기록은 다시 생기지 않는다
- 같은 러닝이 앱/워치 양쪽에서 들어와도 dedupe가 동작한다
- 가져온 직후 홈과 내 활동에서 최신 기록이 보인다

## iPhone / Apple Watch 체크리스트
### 1. NRC
사전 준비:
- iPhone `설정 -> 건강 -> 데이터 접근`에서 NRC가 운동 쓰기 허용
- RunningGround에서 `Apple Health` 연결 완료

테스트:
1. NRC로 1회 러닝 기록
2. Apple 건강 앱에 같은 운동이 보이는지 확인
3. RunningGround에서 `기록 가져오기` 실행
4. `내 활동`에서 새 기록 1개 생성 확인
5. 다시 가져오기 눌러도 중복 생성 안 되는지 확인

통과:
- source가 `NRC` 또는 Apple Health 경유 NRC로 읽힘
- 같은 러닝이 2개 생기지 않음

### 2. MyNB
사전 준비:
- MyNB가 Apple Health에 운동을 쓰도록 허용
- RunningGround에서 `Apple Health` 연결 완료

테스트:
1. MyNB로 1회 러닝 기록
2. Apple 건강 앱에 운동 반영 확인
3. RunningGround에서 `기록 가져오기` 실행
4. `내 활동`과 `기록 상세`에서 source 확인

통과:
- source가 `MyNB` 또는 Apple Health 경유 MyNB로 읽힘
- 같은 러닝이 두 번 생기지 않음

### 3. Strava / Garmin
사전 준비:
- RunningGround에서 해당 직접 소스 연결

테스트:
1. Strava 또는 Garmin Connect에 새 러닝이 있는지 확인
2. RunningGround에서 동기화
3. 새 기록 1개 반영 확인
4. 재동기화 시 중복 없는지 확인

## Galaxy / Galaxy Watch 체크리스트
### 1. Samsung Health + Health Connect
사전 준비:
- Galaxy Watch 러닝이 Samsung Health에 들어오는지 확인
- Samsung Health <-> Health Connect 공유 허용
- RunningGround에서 `Health Connect` 연결 완료

테스트:
1. Galaxy Watch로 1회 러닝
2. Samsung Health에 운동 반영 확인
3. Health Connect 허용 상태 확인
4. RunningGround에서 `기기 기록 가져오기` 실행
5. `내 활동`에서 1개만 생성되는지 확인

통과:
- source가 `Health Connect`
- 러닝 1개가 1개로만 들어옴

### 2. NRC
사전 준비:
- Health Connect 연결
- NRC를 쓴다면 `Partners` 경로도 같이 확인

테스트:
1. NRC 또는 Galaxy Watch 쪽에서 러닝 기록
2. 실제로 어디에 최종 기록이 쌓였는지 확인
3. RunningGround에서 가져오기
4. source 표기가 어떤 경로로 들어왔는지 기록

통과:
- 기록이 1개만 생김
- source가 현재 연결 경로와 맞음

### 3. MyNB
사전 준비:
- Health Connect 연결
- MyNB 기록이 기기 허브에 반영되는지 확인

테스트:
1. MyNB로 러닝 기록
2. Health Connect 경로에 반영 확인
3. RunningGround에서 가져오기
4. 중복 없이 1개 반영 확인

### 4. Strava / Garmin
사전 준비:
- RunningGround에서 직접 소스 연결

테스트:
1. Strava 또는 Garmin Connect에 새 운동 생성
2. RunningGround에서 동기화
3. `내 활동`에서 새 기록 확인
4. 재동기화 중복 여부 확인

## 중복 방지 꼭 볼 것
특히 아래 경우는 꼭 본다.

- iPhone에서 `NRC + Apple Watch 운동`이 같은 러닝으로 잡히는 경우
- Galaxy에서 `MyNB + Galaxy Watch`가 같은 러닝으로 잡히는 경우
- Strava와 Health Connect가 같은 러닝을 같이 갖는 경우

통과 기준:
- 시작/종료 시각이 비슷하고 거리도 거의 같은 운동이면 `1개만` 남아야 한다

## 실패하면 남길 것
문제가 생기면 아래만 적어두면 다음 수정이 빠르다.

- 기기: `iPhone 16 Pro`, `Galaxy S24` 같은 실제 기기명
- 시계: `Apple Watch`, `Galaxy Watch`
- 러닝 앱: `NRC`, `MyNB`, `Strava`, `Garmin`
- 기록 경로: `Apple Health`, `Health Connect`, `direct`
- 실제 결과:
  - 기록 안 들어옴
  - 2개 중복 생성
  - source 표기 이상
  - 거리/시간이 이상함

## 추천 실전 순서
1. iPhone TestFlight 설치
2. Galaxy APK 설치
3. iPhone에서 NRC 1회
4. Galaxy에서 Watch 1회
5. iPhone에서 MyNB 1회
6. Galaxy에서 MyNB 또는 NRC 1회
7. Strava / Garmin direct 1회씩
8. 마지막으로 중복 생성 없는지 전체 확인
