import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { ChaseSetupCard } from '@/features/runs/chase/ChaseSetupCard';
import { MatchOptionSelector } from '@/features/runs/components/MatchOptionSelector';
import { PartyRunHomePanel } from '@/features/runs/components/PartyRunHomePanel';
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
};

export function MatchSetupSection({
  matchOptionProps,
  partyRunProps,
  duelSetupProps,
  groupSetupProps,
  chaseSetupVisible,
}: MatchSetupSectionProps) {
  return (
    <View style={styles.matchCard}>
      <MatchOptionSelector {...matchOptionProps} />
      <PartyRunHomePanel {...partyRunProps} />
      {duelSetupProps ? <DuelMatchSetupCard {...duelSetupProps} /> : null}
      {groupSetupProps ? <GroupMatchSetupCard {...groupSetupProps} /> : null}
      {chaseSetupVisible ? <ChaseSetupCard /> : null}
      {/* 1대1(duel)·그룹(group) 대결 중간 알림 설정은 매칭 후 각자의 예약 대기실
          (DuelReservationRoomScreen / GroupReservationRoomScreen)에서 하므로
          러닝 탭에선 중복이라 두 카드 모두 제거. */}
    </View>
  );
}

const styles = StyleSheet.create({
  matchCard: {
    gap: spacing.s10,
    padding: spacing.s14,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.darkSoft,
    backgroundColor: colors.darkMuted,
  },
});
