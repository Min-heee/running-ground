import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
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
