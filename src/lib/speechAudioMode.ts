// TTS 공용 오디오 세션 설정 — 대결 안내(liveMatchGapVoice)와 설정 미리듣기가 같이 쓴다.
// playsInSilentMode 없이는 iOS 무음 스위치가 켜진 기기에서 발화가 통째로 조용해진다
// (설정 화면 미리듣기가 안 들리던 원인). expo-audio 는 동적 import — 모듈이 없는 옛
// 바이너리에선 조용히 no-op (OTA 안전), 한 번 성공하면 메모이즈.

let audioModeConfigured = false;
let audioModeConfigureInFlight: Promise<void> | null = null;

async function getAudioModule() {
  try {
    return await import('expo-audio');
  } catch {
    return null;
  }
}

// 발화 세대 카운터 — 발화가 끝나고 세션을 놓기 전에 새 발화가 시작됐으면 놓지 않는다.
let speechSessionGeneration = 0;
const SESSION_RELEASE_TAIL_MS = 250;

// 발화 직전 호출: 세션 모드 보장 + 오디오 세션 활성화(= 이 시점부터 음악이 덕킹된다).
// 반환된 세대 토큰을 종료 콜백의 release에 넘긴다.
export async function activateSpeechAudioSession(): Promise<number> {
  speechSessionGeneration += 1;
  const generation = speechSessionGeneration;

  await ensureSpeechAudioModeConfigured();
  const Audio = await getAudioModule();
  if (Audio && typeof Audio.setIsAudioActiveAsync === 'function') {
    try {
      await Audio.setIsAudioActiveAsync(true);
    } catch {
      // 활성화 실패해도 발화는 시도한다 (기존 동작과 동일).
    }
  }
  return generation;
}

// 발화 종료(onDone/onStopped/onError) 시 호출: 오디오 세션을 놓아 다른 앱(음악) 볼륨을
// 되돌린다 (오너 2026-08-07: "음성 끝나면 노래 소리가 다시 커져야 하는데 줄어든 채로
// 있어"). iOS는 세션을 비활성화해야 시스템이 다른 앱 덕킹을 해제한다. 꼬리 250ms 뒤에,
// 그 사이 새 발화가 시작되지 않았을 때만 놓는다.
export function releaseSpeechAudioSessionSoon(generation: number): void {
  setTimeout(() => {
    void (async () => {
      if (generation !== speechSessionGeneration) {
        return; // 새 발화가 이미 세션을 쓰는 중
      }
      const Audio = await getAudioModule();
      if (!Audio || typeof Audio.setIsAudioActiveAsync !== 'function') {
        return;
      }
      try {
        await Audio.setIsAudioActiveAsync(false);
      } catch {
        // 해제 실패는 조용히 — 다음 발화 종료 때 다시 시도된다.
      }
    })();
  }, SESSION_RELEASE_TAIL_MS);
}

// Duck other audio (music keeps playing, lowered), play in silent mode, and stay active
// in the background so the announcement is heard with the screen off. Configured once.
export async function ensureSpeechAudioModeConfigured(): Promise<void> {
  if (audioModeConfigured) {
    return;
  }

  if (!audioModeConfigureInFlight) {
    audioModeConfigureInFlight = (async () => {
      const Audio = await getAudioModule();

      if (!Audio || typeof Audio.setAudioModeAsync !== 'function') {
        return;
      }

      try {
        await Audio.setAudioModeAsync({
          playsInSilentMode: true,
          interruptionMode: 'duckOthers',
          allowsRecording: false,
          shouldPlayInBackground: true,
          shouldRouteThroughEarpiece: false,
        });
        audioModeConfigured = true;
      } catch {
        // Older binary without the native expo-audio module — voice just won't play.
      }
    })();
  }

  try {
    await audioModeConfigureInFlight;
  } finally {
    audioModeConfigureInFlight = null;
  }
}
