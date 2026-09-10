import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { Alert, AppState } from 'react-native';

import type { RunMatchMode } from '@/features/runs/hooks/useMatchLifecycle';
import type { PedometerSensorState, TrackerStatus } from '@/features/runs/hooks/useRunTracking';
import {
  getBackgroundRunTrackingSnapshot,
  subscribeBackgroundRunTracking,
} from '@/features/runs/tracking/background';
import { getRawFixSpeedSample } from '@/features/runs/tracking/background/rawFixSpeedStore';
import { getLiveTrackingMetricFrameSnapshot } from '@/features/runs/tracking/liveTrackingMetricStore';
import { speakLiveGapMessage } from '@/lib/liveMatchGapVoice';
import {
  buildCadenceWatchdogPresentation,
  buildCadenceWatchdogTick,
  resolveCadenceDisqualifyAction,
} from './cadenceWatchdogActions';
import {
  advanceCadenceWatchdog,
  createCadenceWatchdogState,
  type CadenceWatchdogState,
} from './cadenceWatchdogModel';

// 1초 틱 — 화면이 켜진 동안의 판정 구동기. 워치독은 포그라운드 창만 세므로(모델 주석
// 참조) JS가 잠든 백그라운드는 원래 판정 대상이 아니다. GPS 스냅샷 구독은 포그라운드에서
// 페이스 갱신 즉시 한 번 더 평가하게 해 창 마감이 타이머 경계에 묶이지 않게 한다.
const EVALUATE_TICK_MS = 1000;

// 페이스 신선도 (적대검증 2026-09-09): 스냅샷의 currentPace는 GPS 픽스가 끊겨도 마지막
// 값이 그대로 남는다 — OS가 위치 콜백을 멈추면 서 있는 러너가 "달리기 속도·걸음 0"으로
// 쌓인다. 마지막 픽스가 이보다 오래됐으면 속도를 모르는 것으로 친다(누적 없음). 값은
// locationDistance의 CURRENT_PACE_STALE_AFTER_MS와 같은 14초.
const PACE_FRESH_MS = 14_000;

// 원시 픽스 속도 신선도 — GPS는 1Hz라 6초 안의 샘플만 "지금 속도"로 믿는다. 트래커가
// 시속 30km 초과 픽스를 거부해 페이스가 비어도(오너 실기기 영상), 원시 속도는 살아 있다.
const RAW_FIX_FRESH_MS = 6_000;

export type CadenceWatchdogInput = {
  status: TrackerStatus;
  matchMode: RunMatchMode;
  // useRunTracking이 소유하는 판정 상태 ref — 저장 커맨드가 같은 원장을 읽어 cadenceAudit을 싣는다.
  cadenceWatchdogRef: MutableRefObject<CadenceWatchdogState>;
  pedometerSensorRef: MutableRefObject<PedometerSensorState>;
  // 실격 액션 — 매치는 기권 커맨드(reason:'disqualified'), 솔로는 기록 폐기. 런타임의 기존
  // 액션 핸들러를 그대로 받는다(내부로 손 뻗지 않는다).
  onDisqualifyMatch: (source: 'duel' | 'group') => Promise<void> | void;
  onDisqualifySolo: () => Promise<void> | void;
};

// 케이던스 워치독 (오너 규칙 2026-09-09): 달리기 속도로 이동하는데 케이던스가 안 찍히면
// 1차 경고, 2차면 부정 러닝 — 매치는 실격패, 솔로는 정지 + 기록 폐기. 판정은 전부 순수
// 모델(advanceCadenceWatchdog)에 있고, 이 훅은 (1) 매초 틱을 조립해 먹이고 (2) 이벤트를
// Alert·TTS·로컬 알림·액션으로 흘려보낸다. 러닝을 절대 막지 않는다 — 모든 부작용은
// fire-and-forget이고, 실격 액션은 모델의 disqualified 래치로 정확히 한 번만 나간다.
export function useCadenceWatchdog(input: CadenceWatchdogInput) {
  const inputRef = useRef(input);
  inputRef.current = input;

  // 실격 액션 이중 발사 방어 — 모델의 disqualified 래치가 1차 방어, 이 ref가 2차.
  const disqualifyFiredRef = useRef(false);
  // 마지막 GPS 픽스(스냅샷 갱신) 시각 — 페이스 신선도 게이트 재료.
  const lastFixAtMsRef = useRef<number | null>(null);

  const { status } = input;
  // 판정은 러닝 에피소드(측정 중·일시정지) 동안만. 'saving'은 저장 커맨드가 원장을 읽는
  // 구간이라 틱을 멈추되 상태는 건드리지 않는다.
  const watchdogActive = status === 'running' || status === 'paused';

  // 새 러닝은 깨끗한 원장에서 시작한다. 'idle'로 돌아온 순간 리셋 — 저장 실패 후 재시도
  // (saving → paused)는 idle을 거치지 않으므로 그 사이 원장이 살아남아 재전송에도 실린다.
  useEffect(() => {
    if (status !== 'idle') {
      return;
    }

    inputRef.current.cadenceWatchdogRef.current = createCadenceWatchdogState();
    disqualifyFiredRef.current = false;
    lastFixAtMsRef.current = null;
  }, [status]);

  useEffect(() => {
    if (!watchdogActive) {
      return undefined;
    }

    const evaluate = () => {
      const current = inputRef.current;
      const nowMs = Date.now();
      const snapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false });
      const frame = getLiveTrackingMetricFrameSnapshot();
      const paceFresh = lastFixAtMsRef.current !== null && nowMs - lastFixAtMsRef.current <= PACE_FRESH_MS;
      const rawFix = getRawFixSpeedSample();
      const rawFixFresh = rawFix !== null && nowMs - rawFix.atMs <= RAW_FIX_FRESH_MS;
      const tick = buildCadenceWatchdogTick({
        nowMs,
        appState: AppState.currentState,
        sensor: current.pedometerSensorRef.current,
        trackingStatus: snapshot.status,
        currentPace: paceFresh ? snapshot.currentPace : null,
        rawFixSpeedMps: rawFixFresh ? rawFix.speedMps : null,
        totalSteps: frame.totalSteps,
      });

      const result = advanceCadenceWatchdog(current.cadenceWatchdogRef.current, tick);
      current.cadenceWatchdogRef.current = result.state;

      if (!result.event) {
        return;
      }

      const action = resolveCadenceDisqualifyAction(current.matchMode);
      const presentation = buildCadenceWatchdogPresentation(result.event, action);

      // 경고: 러닝을 막지 않는다. 음성은 매번(주머니 속 폰), Alert는 첫 경고에만 — 깨끗한
      // 창으로 스트라이크가 되돌아갔다 다시 쌓이면 같은 "(1/2)" 팝업이 반복돼 버그처럼 읽힌다.
      // 로컬 알림은 쓰지 않는다: 이벤트는 포그라운드에서만 나므로 알림은 늘 인앱 배너+소리로
      // Alert·음성 위에 겹칠 뿐이다.
      // 보폭 판정: 달리기를 멈추지 않는다. 런당 한 번만 나므로 Alert·음성 모두 그대로 낸다.
      if (result.event.type === 'suspect') {
        void speakLiveGapMessage(presentation.speech);
        Alert.alert(presentation.title, presentation.body, [{ text: '확인' }]);
        return;
      }

      if (result.event.type === 'warning') {
        void speakLiveGapMessage(presentation.speech);
        if (result.state.warningsIssued <= 1) {
          Alert.alert(presentation.title, presentation.body, [{ text: '확인' }]);
        }
        return;
      }

      // 실격: 정확히 한 번.
      if (disqualifyFiredRef.current) {
        return;
      }
      disqualifyFiredRef.current = true;

      void speakLiveGapMessage(presentation.speech);

      if (action.kind === 'forfeit') {
        // 매치는 Alert를 띄우지 않는다 — '결과 저장 중' 오버레이와 기록 상세의 '실격패' 카드가
        // 설명을 맡고, 네이티브 Alert는 화면 교체 뒤에도 남아 세 겹으로 겹친다(적대검증).
        void Promise.resolve(current.onDisqualifyMatch(action.source)).catch(() => undefined);
      } else {
        Alert.alert(presentation.title, presentation.body, [{ text: '확인' }]);
        void Promise.resolve(current.onDisqualifySolo()).catch(() => undefined);
      }
    };

    evaluate();

    const intervalId = setInterval(evaluate, EVALUATE_TICK_MS);
    const unsubscribeTracking = subscribeBackgroundRunTracking(() => {
      lastFixAtMsRef.current = Date.now();
      evaluate();
    }, { cloneRoute: false });
    // 포그라운드 ↔ 백그라운드 전환 즉시 연속성 절단/유예 시작을 반영한다 (다음 틱까지
    // 기다리면 복귀 직후 1초가 잘못 누적될 수 있다).
    const appStateSubscription = AppState.addEventListener('change', () => {
      evaluate();
    });

    return () => {
      clearInterval(intervalId);
      unsubscribeTracking();
      appStateSubscription.remove();
    };
  }, [watchdogActive]);
}
