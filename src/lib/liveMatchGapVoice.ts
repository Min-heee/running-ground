// Text-to-speech output for the live opponent-gap feature, so the gap can be heard
// through earphones while running (screen off, phone in pocket). Uses expo-speech for
// TTS and expo-audio to duck background music and keep audio alive in the background.
//
// Requires a NATIVE BUILD with expo-speech + expo-audio compiled in and the iOS `audio`
// UIBackgroundMode. On an older binary lacking these, every call no-ops gracefully (the
// dynamic imports fail and are caught), so this is safe to ship over OTA ahead of the
// rebuild — voice simply stays silent until the native build lands.

let audioModeConfigured = false;
let audioModeConfigureInFlight: Promise<void> | null = null;

async function getSpeechModule() {
  try {
    return await import('expo-speech');
  } catch {
    return null;
  }
}

async function getAudioModule() {
  try {
    return await import('expo-audio');
  } catch {
    return null;
  }
}

// Duck other audio (music keeps playing, lowered), play in silent mode, and stay active
// in the background so the announcement is heard with the screen off. Configured once.
async function ensureAudioModeConfigured() {
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

export async function speakLiveGapMessage(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }

  const Speech = await getSpeechModule();
  if (!Speech || typeof Speech.speak !== 'function') {
    return;
  }

  await ensureAudioModeConfigured();

  try {
    // Drop any still-queued announcement so we always read the freshest gap, never a
    // backlog (utterances are short and the interval is >= 30s, so this rarely fires).
    if (typeof Speech.stop === 'function') {
      await Speech.stop().catch(() => undefined);
    }

    Speech.speak(trimmed, {
      language: 'ko-KR',
      onError: () => undefined,
    });
  } catch {
    // Never let a TTS failure disrupt the run.
  }
}
