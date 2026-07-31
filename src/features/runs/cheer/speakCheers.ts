// 응원 메시지 음성 재생 (오너 2026-07-31) — 하트비트 응답에 실려온 친구 응원을 러닝 중에
// 귀로 들려준다. 대결 중간 알림에서 검증된 TTS 파이프(liveMatchGapVoice: expo-speech +
// 오디오 덕킹 + 백그라운드 오디오)를 그대로 쓴다 — 네이티브 모듈이 없는 구버전 빌드에선
// 조용히 no-op이라 OTA로 먼저 나가도 안전하다.
//
// 여러 개가 한 번에 오면 문장 하나로 합쳐 말한다 — speakLiveGapMessage는 이전 발화를
// 끊고 시작하므로(Speech.stop) 하나씩 말하면 마지막 것만 들린다 (몰수 안내에서 배운 것).

import type { LiveRunCheer } from '@/lib/api/types';
import { speakLiveGapMessage } from '@/lib/liveMatchGapVoice';

// 한 번에 읽는 응원 수 상한 — 서버 보관 상한(20)이 통째로 오면 발화가 25초 하트비트보다
// 길어져 다음 드레인이 끊고, 러닝 내내 음성이 점거된다(적대 검증 발견). 3개까지 원문,
// 나머지는 인원수 요약.
export const CHEER_SPEECH_MAX_VERBATIM = 3;

export function buildCheerSpeech(cheers: LiveRunCheer[]): string | null {
  const valid = (cheers ?? []).filter((cheer) => cheer?.fromName && cheer?.message);

  if (!valid.length) {
    return null;
  }

  const spoken = valid.slice(0, CHEER_SPEECH_MAX_VERBATIM)
    .map((cheer) => `${cheer.fromName}님의 응원. ${cheer.message}`)
    .join(' ');
  const remaining = valid.length - CHEER_SPEECH_MAX_VERBATIM;

  return remaining > 0 ? `${spoken} 외 ${remaining}명이 응원했어요.` : spoken;
}

export async function speakCheers(cheers: LiveRunCheer[]): Promise<void> {
  const speech = buildCheerSpeech(cheers);

  if (!speech) {
    return;
  }

  try {
    await speakLiveGapMessage(speech);
  } catch {
    // 음성 실패는 러닝을 방해하지 않는다.
  }
}
