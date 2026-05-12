import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { MatchOptionSelector } from '@/features/runs/components/MatchOptionSelector';
import { PartyRunHomePanel } from '@/features/runs/components/PartyRunHomePanel';
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
    gap: 10,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#1F2937',
  },
});
