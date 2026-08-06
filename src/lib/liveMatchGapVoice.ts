// Text-to-speech output for the live opponent-gap feature, so the gap can be heard
// through earphones while running (screen off, phone in pocket). Uses expo-speech for
// TTS and expo-audio to duck background music and keep audio alive in the background.
//
// Requires a NATIVE BUILD with expo-speech + expo-audio compiled in and the iOS `audio`
// UIBackgroundMode. On an older binary lacking these, every call no-ops gracefully (the
// dynamic imports fail and are caught), so this is safe to ship over OTA ahead of the
// rebuild — voice simply stays silent until the native build lands.

import {
  activateSpeechAudioSession,
  releaseSpeechAudioSessionSoon,
} from '@/lib/speechAudioMode';
import { getPreferredVoiceIdentifier } from '@/lib/speechVoicePreference';

async function getSpeechModule() {
  try {
    return await import('expo-speech');
  } catch {
    return null;
  }
}

type SpeechModule = NonNullable<Awaited<ReturnType<typeof getSpeechModule>>>;

// 목소리 다듬기 (오너 2026-08-01: "너무 사이버 여자같아") — language만 주면 시스템 기본
// compact 음성이 잡히는데 그게 기계음의 원인이다. 기기에 있는 한국어 음성 중 고품질을
// 골라 쓴다: iOS는 Enhanced 품질(설정에서 받은 고품질 유나 등), Android(Google TTS)는
// network 계열이 local보다 훨씬 자연스럽다. 좋은 후보가 없으면 시스템 기본 그대로.
let voiceResolved = false;
let voiceIdentifier: string | null = null;
let voiceResolveInFlight: Promise<void> | null = null;

function scoreKoreanVoice(voice: { identifier?: string; quality?: string }) {
  const identifier = (voice.identifier ?? '').toLowerCase();
  let score = 0;

  if (voice.quality === 'Enhanced') {
    score += 4;
  }

  if (identifier.includes('network')) {
    score += 2;
  }

  return score;
}

async function ensureVoiceResolved(Speech: SpeechModule) {
  if (voiceResolved) {
    return;
  }

  if (!voiceResolveInFlight) {
    voiceResolveInFlight = (async () => {
      if (typeof Speech.getAvailableVoicesAsync !== 'function') {
        voiceResolved = true;
        return;
      }

      try {
        const voices = await Speech.getAvailableVoicesAsync();

        if (!Array.isArray(voices) || voices.length === 0) {
          // Android TTS 엔진이 아직 안 깬 앱 초기엔 빈 목록이 온다 — 다음 발화 때 재시도.
          return;
        }

        const korean = voices.filter((voice) =>
          (voice.language ?? '').toLowerCase().replace('_', '-').startsWith('ko'));
        const best = [...korean].sort((a, b) => scoreKoreanVoice(b) - scoreKoreanVoice(a))[0];

        voiceIdentifier = best && scoreKoreanVoice(best) > 0 ? best.identifier : null;
        voiceResolved = true;
      } catch {
        // 조회가 안 되는 바이너리면 시스템 기본으로 계속 — 재시도도 무의미하다.
        voiceResolved = true;
      }
    })();
  }

  try {
    await voiceResolveInFlight;
  } finally {
    voiceResolveInFlight = null;
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

  // 활성화(= 음악 덕킹 시작)와 세대 토큰 — 발화가 끝나면 세션을 놓아 음악 볼륨을
  // 되돌린다. stop()이 이전 발화의 onStopped를 늦게 쏴도 세대가 달라 무해하다.
  const sessionGeneration = await activateSpeechAudioSession();
  await ensureVoiceResolved(Speech);

  try {
    // Drop any still-queued announcement so we always read the freshest gap, never a
    // backlog (utterances are short and the interval is >= 30s, so this rarely fires).
    if (typeof Speech.stop === 'function') {
      await Speech.stop().catch(() => undefined);
    }

    // 사용자가 설정에서 고른 목소리가 있으면 자동 추천보다 우선한다 (오너 2026-08-06).
    const preferredVoice = await getPreferredVoiceIdentifier();
    const effectiveVoice = preferredVoice ?? voiceIdentifier;

    Speech.speak(trimmed, {
      language: 'ko-KR',
      ...(effectiveVoice ? { voice: effectiveVoice } : {}),
      // 기본보다 반 톤 낮춰서 쨍한 기계음 느낌을 줄인다.
      pitch: 0.95,
      onDone: () => releaseSpeechAudioSessionSoon(sessionGeneration),
      onStopped: () => releaseSpeechAudioSessionSoon(sessionGeneration),
      onError: () => releaseSpeechAudioSessionSoon(sessionGeneration),
    });
  } catch {
    // Never let a TTS failure disrupt the run.
    releaseSpeechAudioSessionSoon(sessionGeneration);
  }
}
