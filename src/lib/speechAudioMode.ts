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
