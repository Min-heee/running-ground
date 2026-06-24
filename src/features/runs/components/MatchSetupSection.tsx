import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { MatchOptionSelector } from '@/features/runs/components/MatchOptionSelector';
import { PartyRunHomePanel } from '@/features/runs/components/PartyRunHomePanel';
import { LiveGapPushCard } from '@/features/runs/components/matchSetupCards/LiveGapPushCard';
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
};

export function MatchSetupSection({
  matchOptionProps,
  partyRunProps,
  duelSetupProps,
  groupSetupProps,
}: MatchSetupSectionProps) {
  return (
    <View style={styles.matchCard}>
      <MatchOptionSelector {...matchOptionProps} />
      <PartyRunHomePanel {...partyRunProps} />
      {duelSetupProps ? <DuelMatchSetupCard {...duelSetupProps} /> : null}
      {groupSetupProps ? <GroupMatchSetupCard {...groupSetupProps} /> : null}
      {/* 1대1(duel) 대결 중간 알림 설정은 매칭 후 예약 대기실(DuelReservationRoomScreen)에서
          하므로 러닝 탭에선 중복이라 제거. 그룹은 아직 예약 대기실이 없어 여기서 설정한다. */}
      {groupSetupProps ? <LiveGapPushCard mode="group" /> : null}
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
