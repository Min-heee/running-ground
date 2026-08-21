// 음성 안내 목소리 선택 (오너 2026-08-06): 페이스메이커·VS ME·대결 안내·응원이 모두
// 쓰는 TTS 깔때기(liveMatchGapVoice)의 목소리를 사용자가 고를 수 있게 한다.
// 'auto'(기본) = 기존 자동 추천(고품질 한국어 우선), 그 외 = 기기 음성 identifier.
// expo 모듈은 전부 동적 import — 모듈 없는 옛 바이너리에선 조용히 no-op (OTA 안전).

const VOICE_PREFERENCE_KEY = 'runningground.speechVoice.v1';

export const AUTO_VOICE_ID = 'auto';

let memoizedPreference: string | null | undefined;

async function getSecureStore() {
  try {
    return await import('expo-secure-store');
  } catch {
    return null;
  }
}

// 선택된 목소리 identifier. null = 자동 추천(기본).
export async function getPreferredVoiceIdentifier(): Promise<string | null> {
  if (typeof memoizedPreference !== 'undefined') {
    return memoizedPreference;
  }
  const SecureStore = await getSecureStore();
  if (!SecureStore) {
    memoizedPreference = null;
    return null;
  }
  try {
    const stored = await SecureStore.getItemAsync(VOICE_PREFERENCE_KEY);
    memoizedPreference = stored && stored !== AUTO_VOICE_ID ? stored : null;
  } catch {
    memoizedPreference = null;
  }
  return memoizedPreference;
}

export async function setPreferredVoiceIdentifier(identifier: string | null): Promise<void> {
  memoizedPreference = identifier && identifier !== AUTO_VOICE_ID ? identifier : null;
  const SecureStore = await getSecureStore();
  if (!SecureStore) {
    return;
  }
  try {
    if (memoizedPreference) {
      await SecureStore.setItemAsync(VOICE_PREFERENCE_KEY, memoizedPreference);
    } else {
      await SecureStore.deleteItemAsync(VOICE_PREFERENCE_KEY);
    }
  } catch {
    // 저장 실패해도 세션 메모이즈로 이번 실행 동안은 적용된다.
  }
}

export type KoreanVoiceOption = {
  identifier: string;
  label: string;
  isEnhanced: boolean;
};

// 목소리 표시명: 기기 이름(Yuna 등)을 우선, 없으면 identifier 꼬리를 다듬는다.
export function buildVoiceOptionLabel(voice: { identifier?: string; name?: string }): string {
  const name = (voice.name ?? '').trim();
  if (name && !name.includes('.')) {
    return name;
  }
  const tail = (voice.identifier ?? '').split(/[.#]/).filter(Boolean).pop() ?? '';
  const cleaned = tail.replace(/[-_]?(compact|premium|enhanced)$/i, '').replace(/[-_]/g, ' ').trim();
  return cleaned || '기기 음성';
}

export async function listKoreanVoiceOptions(): Promise<KoreanVoiceOption[]> {
  try {
    const Speech = await import('expo-speech');
    if (typeof Speech.getAvailableVoicesAsync !== 'function') {
      return [];
    }
    const voices = await Speech.getAvailableVoicesAsync();
    if (!Array.isArray(voices)) {
      return [];
    }
    return voices
      .filter((voice) => (voice.language ?? '').toLowerCase().replace('_', '-').startsWith('ko'))
      .filter((voice) => Boolean(voice.identifier))
      .map((voice) => ({
        identifier: voice.identifier as string,
        label: buildVoiceOptionLabel(voice),
        isEnhanced: voice.quality === 'Enhanced'
          || (voice.identifier ?? '').toLowerCase().includes('network')
          || (voice.identifier ?? '').toLowerCase().includes('premium'),
      }))
      .sort((a, b) => Number(b.isEnhanced) - Number(a.isEnhanced) || a.label.localeCompare(b.label));
  } catch {
    return [];
  }
}

// 미리듣기 — 선택 전에 그 목소리로 샘플을 읽어준다 (깔때기의 저장값과 무관).
export async function previewVoice(identifier: string | null): Promise<void> {
  try {
    const Speech = await import('expo-speech');
    if (typeof Speech.speak !== 'function') {
      return;
    }
    // 무음 스위치가 켜진 iPhone에서도 들리게 — 대결 안내와 같은 오디오 세션을 쓰고,
    // 끝나면 세션을 놓아 듣던 음악 볼륨을 되돌린다 (오너 2026-08-07 덕킹 미복원 수정).
    const {
      activateSpeechAudioSession,
      releaseSpeechAudioSessionSoon,
    } = await import('@/lib/speechAudioMode');
    const sessionGeneration = await activateSpeechAudioSession();
    if (typeof Speech.stop === 'function') {
      await Speech.stop().catch(() => undefined);
    }
    Speech.speak('안녕하세요, 러닝스페이스예요. 오늘도 가볍게 달려볼까요?', {
      language: 'ko-KR',
      ...(identifier ? { voice: identifier } : {}),
      pitch: 0.95,
      onDone: () => releaseSpeechAudioSessionSoon(sessionGeneration),
      onStopped: () => releaseSpeechAudioSessionSoon(sessionGeneration),
      onError: () => releaseSpeechAudioSessionSoon(sessionGeneration),
    });
  } catch {
    // 미리듣기 실패는 조용히.
  }
}
