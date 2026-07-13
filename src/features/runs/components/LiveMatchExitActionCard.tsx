import { memo, useCallback } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { Card } from '@/components/Card';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import type { MatchExitActionState } from '@/features/runs/lifecycle/matchExitAction';
import type { MatchExitSource } from '@/features/runs/lifecycle/matchExitFlow';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import { useDevRenderCounter } from '@/utils/useDevRenderCounter';
import { colors, fixedColors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

export type LiveMatchExitActionCardProps = {
  source: MatchExitSource | null;
  actionState: MatchExitActionState;
  onContinueSolo: (source: MatchExitSource) => void;
  onForfeit: (source: MatchExitSource) => void;
  onShowResultAfterCounterpartForfeit: (source: MatchExitSource) => void;
  onShowResultAfterSelfForfeit: (source: MatchExitSource) => void;
};

export const LiveMatchExitActionCard = memo(function LiveMatchExitActionCard({
  source,
  actionState,
  onContinueSolo,
  onForfeit,
  onShowResultAfterCounterpartForfeit,
  onShowResultAfterSelfForfeit,
}: LiveMatchExitActionCardProps) {
  useDevRenderCounter(`LiveMatchExitActionCard:${source ?? 'hidden'}`);

  const handleContinueSoloPress = useCallback(() => {
    if (!source) {
      return;
    }
    onContinueSolo(source);
  }, [onContinueSolo, source]);
  const handleForfeitPress = useCallback(() => {
    if (!source) {
      return;
    }
    rgPerfMark('forfeit button press', { source });
    // Confirm before forfeiting; only "예" runs the existing forfeit action.
    Alert.alert('정말 기권하시겠습니까?', undefined, [
      { text: '아니요', style: 'cancel' },
      {
        text: '예',
        style: 'destructive',
        onPress: () => {
          onForfeit(source);
        },
      },
    ]);
  }, [onForfeit, source]);
  const handleShowResultPress = useCallback(() => {
    if (!source) {
      return;
    }
    rgPerfMark('counterpart forfeit result button press', { source });
    onShowResultAfterCounterpartForfeit(source);
  }, [onShowResultAfterCounterpartForfeit, source]);
  const handleShowSelfForfeitResultPress = useCallback(() => {
    if (!source) {
      return;
    }
    rgPerfMark('self forfeit result button press', { source });
    onShowResultAfterSelfForfeit(source);
  }, [onShowResultAfterSelfForfeit, source]);

  // FIX-C (2026-07-09) — the self-finished/self-forfeited AUTO-exit effect that lived here
  // was HOISTED to useMatchSelfEndAutoExit (mounted at the runtime-model layer). This card is
  // rendered only on the arena pager page / result page, so the effect never existed while
  // the runner sat on another segment — and its one-shot ref latched BEFORE the handler ran
  // (a single isSaving early-return permanently disabled auto-exit for the mount). The card
  // keeps its UI (manual buttons) unchanged.

  if (!source || actionState.kind === 'hidden') {
    return null;
  }

  if (actionState.kind === 'test-exit') {
    return (
      <Card style={styles.testExitCard}>
        <Text style={styles.title}>{actionState.title}</Text>
        <Text style={styles.text}>{actionState.body}</Text>
        <SecondaryButton
          label={actionState.buttonLabel}
          onPress={handleContinueSoloPress}
          disabled={actionState.disabled}
        />
      </Card>
    );
  }

  if (actionState.kind === 'counterpart-forfeited' || actionState.kind === 'sole-survivor') {
    // Both end the run WITHOUT marking the current user as forfeited, so they share the
    // non-forfeit show-result handler (handleShowResultPress).
    return (
      <Card style={styles.card}>
        <Text style={styles.title}>{actionState.title}</Text>
        <Text style={styles.text}>{actionState.body}</Text>
        <Pressable
          style={[styles.button, actionState.disabled ? styles.buttonDisabled : undefined]}
          onPress={handleShowResultPress}
          disabled={actionState.disabled}
        >
          <Text style={styles.buttonText}>{actionState.buttonLabel}</Text>
        </Pressable>
      </Card>
    );
  }

  if (actionState.kind === 'self-forfeited') {
    return (
      <Card style={styles.card}>
        <Text style={styles.title}>{actionState.title}</Text>
        <Text style={styles.text}>{actionState.body}</Text>
        <Pressable
          style={[styles.button, actionState.disabled ? styles.buttonDisabled : undefined]}
          onPress={handleShowSelfForfeitResultPress}
          disabled={actionState.disabled}
        >
          <Text style={styles.buttonText}>{actionState.buttonLabel}</Text>
        </Pressable>
      </Card>
    );
  }

  if (actionState.kind === 'self-finished') {
    return (
      <Card style={styles.card}>
        <Text style={styles.title}>{actionState.title}</Text>
        <Text style={styles.text}>{actionState.body}</Text>
        <Pressable
          style={[styles.button, actionState.disabled ? styles.buttonDisabled : undefined]}
          onPress={handleShowResultPress}
          disabled={actionState.disabled}
        >
          <Text style={styles.buttonText}>{actionState.buttonLabel}</Text>
        </Pressable>
      </Card>
    );
  }

  // Forfeit card: only the 기권하기 button remains — the descriptive title/body
  // were removed. The button now opens a confirm dialog (see handleForfeitPress).
  return (
    <Card style={styles.card}>
      <Pressable
        style={[styles.button, actionState.disabled ? styles.buttonDisabled : undefined]}
        onPress={handleForfeitPress}
        disabled={actionState.disabled}
      >
        <Text style={styles.buttonText}>{actionState.buttonLabel}</Text>
      </Pressable>
    </Card>
  );
}, (prevProps, nextProps) => (
  prevProps.source === nextProps.source
  && areMatchExitActionStatesEqual(prevProps.actionState, nextProps.actionState)
  && prevProps.onContinueSolo === nextProps.onContinueSolo
  && prevProps.onForfeit === nextProps.onForfeit
  && prevProps.onShowResultAfterCounterpartForfeit === nextProps.onShowResultAfterCounterpartForfeit
  && prevProps.onShowResultAfterSelfForfeit === nextProps.onShowResultAfterSelfForfeit
));

function areMatchExitActionStatesEqual(
  left: MatchExitActionState,
  right: MatchExitActionState,
) {
  if (left.kind !== right.kind) {
    return false;
  }

  if (left.kind === 'hidden' || right.kind === 'hidden') {
    return true;
  }

  return left.title === right.title
    && left.body === right.body
    && left.buttonLabel === right.buttonLabel
    && left.disabled === right.disabled;
}

const styles = StyleSheet.create({
  testExitCard: {
    gap: spacing.s10,
    borderColor: colors.brandLight,
    borderWidth: 1,
    backgroundColor: fixedColors.brandWash,
  },
  card: {
    gap: spacing.s10,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    backgroundColor: colors.dangerSurface,
  },
  title: {
    color: colors.dangerDeep,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.black,
  },
  text: {
    color: fixedColors.danger,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
    lineHeight: 20,
  },
  button: {
    marginTop: spacing.sm,
    minHeight: 50,
    borderRadius: radii.md,
    backgroundColor: fixedColors.dangerBright,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s14,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: colors.white,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.black,
  },
});
