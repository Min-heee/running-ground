// 기권 vs 실격 표기 (오너 규칙 2026-09-09). 서버는 부정 러닝(케이던스 워치독) 기권을
// liveStatus 'forfeited' + disqualified:true 로 내려준다 — 같은 forfeited 흐름을 타되 라벨만
// '실격'으로 바꾼다. 플래그가 없으면(구 서버·일반 기권) 오늘의 '기권' 그대로.

export function resolveForfeitStatusLabel(disqualified?: boolean | null): '실격' | '기권' {
  return disqualified === true ? '실격' : '기권';
}

export function resolveForfeitProcessedLabel(disqualified?: boolean | null): string {
  return disqualified === true ? '실격 처리됨' : '기권 처리됨';
}

export function resolveOpponentForfeitTitle(disqualified?: boolean | null): string {
  return disqualified === true ? '상대가 실격됐어요' : '상대가 기권했어요';
}

// 음성/알림용 한 줄: "{name}님이 기권했어요" / "{name}님이 실격됐어요" (이름 없으면 '상대가').
export function buildForfeiterAnnouncement(name: string | null, disqualified?: boolean | null): string {
  const subject = name ? `${name}님이` : '상대가';
  return disqualified === true ? `${subject} 실격됐어요` : `${subject} 기권했어요`;
}
