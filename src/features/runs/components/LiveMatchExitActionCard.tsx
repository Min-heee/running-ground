import { Pressable, StyleSheet, Text } from 'react-native';
import { Card } from '@/components/Card';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { buildMatchExitActionState } from '@/features/runs/matchExitAction';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import { useDevRenderCounter } from '@/utils/useDevRenderCounter';

type MatchExitSource = 'duel' | 'group';

type LiveMatchExitActionCardProps = {
  source: MatchExitSource | null;
  isTestMatch: boolean;
  isLeaving: boolean;
  isSaving: boolean;
  isRunning: boolean;
  counterpartForfeited: boolean;
  onContinueSolo: (source: MatchExitSource) => void;
  onForfeit: (source: MatchExitSource) => void;
  onShowResultAfterCounterpartForfeit: (source: MatchExitSource) => void;
};

export function LiveMatchExitActionCard({
  source,
  isTestMatch,
  isLeaving,
  isSaving,
  isRunning,
  counterpartForfeited,
  onContinueSolo,
  onForfeit,
  onShowResultAfterCounterpartForfeit,
}: LiveMatchExitActionCardProps) {
  useDevRenderCounter(`LiveMatchExitActionCard:${source ?? 'hidden'}`);
  if (!source) {
    return null;
  }

  const actionState = buildMatchExitActionState({
    source,
    isTestMatch,
    isLeaving,
    isSaving,
    isRunning,
    counterpartForfeited,
  });

  if (actionState.kind === 'hidden') {
    return null;
  }

  if (actionState.kind === 'test-exit') {
    return (
      <Card style={styles.testExitCard}>
        <Text style={styles.title}>{actionState.title}</Text>
        <Text style={styles.text}>{actionState.body}</Text>
        <SecondaryButton
          label={actionState.buttonLabel}
          onPress={() => onContinueSolo(source)}
          disabled={actionState.disabled}
        />
      </Card>
    );
  }

  if (actionState.kind === 'counterpart-forfeited') {
    return (
      <Card style={styles.card}>
        <Text style={styles.title}>{actionState.title}</Text>
        <Text style={styles.text}>{actionState.body}</Text>
        <Pressable
          style={[styles.button, actionState.disabled ? styles.buttonDisabled : undefined]}
          onPress={() => {
            rgPerfMark('counterpart forfeit result button press', { source });
            onShowResultAfterCounterpartForfeit(source);
          }}
          disabled={actionState.disabled}
        >
          <Text style={styles.buttonText}>{actionState.buttonLabel}</Text>
        </Pressable>
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>{actionState.title}</Text>
      <Text style={styles.text}>{actionState.body}</Text>
      <Pressable
        style={[styles.button, actionState.disabled ? styles.buttonDisabled : undefined]}
        onPress={() => {
          rgPerfMark('forfeit button press', { source });
          onForfeit(source);
        }}
        disabled={actionState.disabled}
      >
        <Text style={styles.buttonText}>{actionState.buttonLabel}</Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  testExitCard: {
    gap: 10,
    borderColor: '#818CF8',
    borderWidth: 1,
    backgroundColor: '#EEF2FF',
  },
  card: {
    gap: 10,
    borderColor: '#FECACA',
    borderWidth: 1,
    backgroundColor: '#FEF2F2',
  },
  title: {
    color: '#7F1D1D',
    fontSize: 16,
    fontWeight: '900',
  },
  text: {
    color: '#B42318',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
  },
  button: {
    marginTop: 4,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: '#D92D20',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
});
