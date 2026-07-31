// 러닝 탭 모드 묶음 (오너 2026-07-31, 시안 D) — 순수 로직만.
//
// 5개 모드를 '누구와 뛰는가'로 묶고, 선택된 모드가 속한 묶음만 화면에 남긴다. 예전처럼
// 5개를 2열 그리드에 한꺼번에 늘어놓으면 마지막 칸이 비고, 성격이 다른 모드들이 같은 무게로
// 보이고, 어떤 모드를 골라도 아래 예약 패널이 같은 자리를 차지했다.

import type { MatchOptionItem, MatchOptionMode } from '@/features/runs/components/MatchOptionSelector';

export type MatchOptionSegmentId = 'alone' | 'compete' | 'friends';

export type MatchOptionSegmentDefinition = {
  id: MatchOptionSegmentId;
  label: string;
  modes: MatchOptionMode[];
};

export type MatchOptionSegment = MatchOptionSegmentDefinition & {
  options: MatchOptionItem[];
};

//  혼자   — 상대가 없는 러닝. 경찰과 도둑도 혼자 뛰고 스친 사람에게서 포인트만 붙는다.
//  매칭   — 모르는 러너와 붙는다. 시간을 잡아야 해서 예약 패널이 이 묶음에서만 뜬다.
//  파티런 — 내가 방을 열고 친구를 부른다.
export const MATCH_OPTION_SEGMENTS: MatchOptionSegmentDefinition[] = [
  { id: 'alone', label: '혼자', modes: ['solo', 'chase'] },
  { id: 'compete', label: '매칭', modes: ['duel', 'group'] },
  { id: 'friends', label: '파티런', modes: ['room'] },
];

// 정의된 순서를 지키되, 옵션이 하나도 없는 묶음은 만들지 않는다 — 모드가 플래그로 빠졌을 때
// 눌러도 아무것도 없는 빈 탭이 남으면 안 된다.
export function buildMatchOptionSegments(
  options: MatchOptionItem[],
  definitions: MatchOptionSegmentDefinition[] = MATCH_OPTION_SEGMENTS,
): MatchOptionSegment[] {
  return definitions
    .map((definition) => ({
      ...definition,
      options: definition.modes
        .map((mode) => options.find((option) => option.mode === mode))
        .filter((option): option is MatchOptionItem => Boolean(option)),
    }))
    .filter((segment) => segment.options.length > 0);
}

// 활성 묶음은 '지금 선택된 모드가 속한 묶음'으로 파생시킨다. 별도 상태로 들고 있으면
// 프로그램이 모드를 바꿨을 때(방 입장 등) 탭과 내용이 어긋난다.
export function resolveActiveMatchOptionSegment(
  segments: MatchOptionSegment[],
  selectedMode: MatchOptionMode,
): MatchOptionSegment | null {
  return segments.find((segment) => segment.options.some((option) => option.mode === selectedMode))
    ?? segments[0]
    ?? null;
}

// 묶음을 누르면 그 묶음의 첫 모드를 고른다. 이미 그 묶음 안에 있으면 아무것도 바꾸지 않는다 —
// 같은 탭을 다시 눌렀다고 고른 모드가 리셋되면 안 된다.
// 모드가 하나뿐인 묶음은 카드를 그리지 않는다 — 탭 이름이 곧 그 모드라서(파티런 탭 아래
// '파티런' 카드) 같은 말이 두 번 나오고, 고를 것도 없는 카드가 자리만 차지한다.
export function shouldRenderMatchOptionCards(segment: MatchOptionSegment | null): boolean {
  return (segment?.options.length ?? 0) > 1;
}

export function resolveSegmentSelection(
  segments: MatchOptionSegment[],
  segmentId: string,
  selectedMode: MatchOptionMode,
): MatchOptionItem | null {
  const segment = segments.find((entry) => entry.id === segmentId);

  if (!segment || segment.options.some((option) => option.mode === selectedMode)) {
    return null;
  }

  return segment.options[0] ?? null;
}
