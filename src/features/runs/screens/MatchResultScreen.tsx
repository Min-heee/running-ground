import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/Screen';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { BrandLoadingView } from '@/components/BrandLoadingView';
import type { ArenaResultLabel } from '@/components/matches/liveMatchArena/types';
import { ResultDuelCard } from '@/features/runs/components/matchResult/ResultDuelCard';
import { ResultRankRow } from '@/features/runs/components/matchResult/ResultRankRow';
import {
  buildMatchResultScreenModel,
  type MatchResultScreenModel,
  type MatchResultScreenRow,
} from '@/features/runs/viewModels/matchResultScreenModel';
import {
  MATCH_PROVISIONAL_NOTICE_LABEL,
  MATCH_REVISED_NOTICE_LABEL,
} from '@/features/runs/viewModels/matchResultModel';
import { fetchMatchResult, isMatchResultNotResolvedError } from '@/lib/api/services';
import type { MatchResultResponse } from '@/lib/api/types';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type MatchResultParams = {
  matchId?: string;
  matchMode?: 'duel' | 'group';
};

type LoadState =
  | { status: 'loading' }
  // 'unresolved' = match not yet finished / no full result (friendly empty state).
  | { status: 'unresolved' }
  // 'error' = an unexpected failure (network etc.) — still a friendly back action.
  | { status: 'error' }
  | { status: 'ready'; model: MatchResultScreenModel };

// Map a duel row's resultTone to the WIN/LOSE/DRAW badge label. A draw collapses both
// cards to DRAW regardless of the row's own tone; otherwise the winner slot is WIN and
// the loser slot is LOSE.
function resolveDuelBadge(
  draw: boolean,
  slot: 'win' | 'lose',
  row: MatchResultScreenRow,
): ArenaResultLabel {
  if (draw || row.resultTone === 'draw') {
    return 'DRAW';
  }
  return slot === 'win' ? 'WIN' : 'LOSE';
}

function DuelBody({ model }: { model: Extract<MatchResultScreenModel, { mode: 'duel' }> }) {
  const draw = Boolean(model.draw);

  return (
    <View style={styles.duelStack}>
      <ResultDuelCard
        row={model.winner}
        variant="win"
        badgeLabel={resolveDuelBadge(draw, 'win', model.winner)}
      />
      <ResultDuelCard
        row={model.loser}
        variant="lose"
        badgeLabel={resolveDuelBadge(draw, 'lose', model.loser)}
      />
    </View>
  );
}

function GroupBody({ model }: { model: Extract<MatchResultScreenModel, { mode: 'group' }> }) {
  return (
    <View style={styles.groupStack}>
      {model.rows.map((row, index) => (
        <ResultRankRow key={`${row.userId ?? 'row'}-${row.rank ?? 'x'}-${index}`} row={row} />
      ))}
    </View>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>{message}</Text>
      <Text style={styles.emptyCaption}>잠시 후 다시 시도해 주세요.</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        style={styles.emptyButton}
      >
        <Text style={styles.emptyButtonText}>돌아가기</Text>
      </Pressable>
    </View>
  );
}

export default function MatchResultScreen() {
  const { matchId, matchMode } = useLocalSearchParams<MatchResultParams>();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    const trimmedMatchId = (matchId ?? '').trim();
    if (!trimmedMatchId) {
      setState({ status: 'unresolved' });
      return () => {
        cancelled = true;
      };
    }

    setState({ status: 'loading' });
    fetchMatchResult(trimmedMatchId)
      .then((response: MatchResultResponse) => {
        if (cancelled) {
          return;
        }
        setState({ status: 'ready', model: buildMatchResultScreenModel(response) });
      })
      .catch((resultError: unknown) => {
        if (cancelled) {
          return;
        }
        setState({
          status: isMatchResultNotResolvedError(resultError) ? 'unresolved' : 'error',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [matchId]);

  // matchMode is an advisory hint from the entry point; the rendered branch always
  // follows the authoritative mode on the fetched model.
  const headerTitle = useMemo(() => {
    const mode = state.status === 'ready' ? state.model.mode : matchMode;
    if (mode === 'group') {
      return '그룹 결과';
    }
    return '대결 결과';
  }, [state, matchMode]);

  if (state.status === 'loading') {
    return <BrandLoadingView />;
  }

  return (
    <Screen>
      <AuthHeader title={headerTitle} showBack />

      {state.status === 'ready' ? (
        <>
          {/* §3-⑨ fair-verdict notices — additive server fields; absent on an old backend,
              so nothing renders then. provisional = the verdict may still be revised while
              the opponent's late record is awaited; revised = the winner was corrected. */}
          {state.model.provisional ? (
            <View style={styles.provisionalBadge}>
              <Text style={styles.provisionalBadgeText}>{MATCH_PROVISIONAL_NOTICE_LABEL}</Text>
            </View>
          ) : null}
          {state.model.revised ? (
            <View style={styles.revisedBanner}>
              <Text style={styles.revisedBannerText}>{MATCH_REVISED_NOTICE_LABEL}</Text>
            </View>
          ) : null}
          {state.model.mode === 'duel' ? (
            <DuelBody model={state.model} />
          ) : (
            <GroupBody model={state.model} />
          )}
        </>
      ) : (
        <EmptyState
          message={
            state.status === 'unresolved'
              ? '결과를 아직 불러올 수 없어요'
              : '결과를 불러오지 못했어요'
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  duelStack: {
    gap: spacing.s12,
  },
  provisionalBadge: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    backgroundColor: colors.orangeWash,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.xxs,
    marginBottom: spacing.s12,
  },
  provisionalBadgeText: {
    color: colors.orangeText,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  revisedBanner: {
    borderRadius: radii.pill,
    backgroundColor: colors.brandWash,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.xxs,
    marginBottom: spacing.s12,
  },
  revisedBannerText: {
    color: colors.brand,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
  groupStack: {
    gap: spacing.xxl,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s10,
    paddingVertical: spacing.s42,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    textAlign: 'center',
  },
  emptyCaption: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    textAlign: 'center',
  },
  emptyButton: {
    marginTop: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.s24,
    paddingVertical: spacing.s12,
  },
  emptyButtonText: {
    color: colors.white,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
});
