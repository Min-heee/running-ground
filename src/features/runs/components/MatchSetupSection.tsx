import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { ChaseSetupCard } from '@/features/runs/chase/ChaseSetupCard';
import { MatchOptionSelector } from '@/features/runs/components/MatchOptionSelector';
import { PartyRunHomePanel } from '@/features/runs/components/PartyRunHomePanel';
import { PartyRunRoomModeChips } from '@/features/runs/components/PartyRunRoomModeChips';
import { colors, spacing, radii } from '@/theme/tokens';
import {
  DuelMatchSetupCard,
  GroupMatchSetupCard,
} from '@/features/runs/components/MatchSetupCards';

type MatchSetupSectionProps = {
  matchOptionProps: ComponentProps<typeof MatchOptionSelector>;
  partyRunProps: ComponentProps<typeof PartyRunHomePanel>;
  duelSetupProps: ComponentProps<typeof DuelMatchSetupCard> | null;
  groupSetupProps: ComponentProps<typeof GroupMatchSetupCard> | null;
  chaseSetupVisible: boolean;
  onChaseStart?: () => void;
};

// 회색 박스 안에는 '고르는 것'만 둔다 (오너 2026-07-31): 묶음 탭 + 모드 카드, 그리고
// 파티런 탭에서는 그 자리를 대신하는 방 종류 칩(1대1 대결 / 그룹 대결). 날짜·시간 예약
// 패널, 초대 코드 입력, 경기장 카드 같은 설정·실행 UI는 전부 박스 밖에 놓는다 — 고르는
// 층과 그 다음에 하는 일이 한 상자에 섞여 있으면 무엇이 선택이고 무엇이 설정인지 안 보인다.
export function MatchSetupSection({
  matchOptionProps,
  partyRunProps,
  duelSetupProps,
  groupSetupProps,
  chaseSetupVisible,
  onChaseStart,
}: MatchSetupSectionProps) {
  // 이미 방에 들어가 있으면 방 종류를 고르는 단계가 아니다 (패널도 같은 조건으로 접힌다).
  const showRoomModeChips = partyRunProps.isSelected && !partyRunProps.currentRoom;

  return (
    <View style={styles.section}>
      <View style={styles.pickerCard}>
        <MatchOptionSelector {...matchOptionProps} />
        {showRoomModeChips ? (
          <PartyRunRoomModeChips
            roomMode={partyRunProps.roomMode}
            onRoomModeChange={partyRunProps.onRoomModeChange}
          />
        ) : null}
      </View>

      <PartyRunHomePanel {...partyRunProps} />
      {duelSetupProps ? <DuelMatchSetupCard {...duelSetupProps} /> : null}
      {groupSetupProps ? <GroupMatchSetupCard {...groupSetupProps} /> : null}
      {chaseSetupVisible ? <ChaseSetupCard onStartRun={onChaseStart} /> : null}
      {/* 1대1(duel)·그룹(group) 대결 중간 알림 설정은 매칭 후 각자의 예약 대기실
          (DuelReservationRoomScreen / GroupReservationRoomScreen)에서 하므로
          러닝 탭에선 중복이라 두 카드 모두 제거. */}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.s10,
  },
  // 시안 '가'(2026-08-03): 다크 래퍼 상자 제거 — 세그먼트·카드가 각자 흰 서피스로
  // 맨바닥에 앉는다.
  pickerCard: {
    gap: spacing.s10,
  },
});
