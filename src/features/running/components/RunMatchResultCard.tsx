import { memo, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';

import { Card } from '@/components/Card';
import {
  MATCH_PROVISIONAL_NOTICE_LABEL,
  MATCH_REVISED_NOTICE_LABEL,
} from '@/features/runs/viewModels/matchResultModel';
import {
  buildDuelBoardRows,
  buildGroupBoardRows,
  buildRunMatchResultCardModel,
  type MatchBoardRow,
  type RunMatchResultCardModelInput,
} from '@/features/running/viewModels/runMatchResultCardModel';
import { fetchMatchResult } from '@/services';
import { colors, fixedColors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

// 대결 기록 결과 보드 (오너 2026-08-06, 시안 나 확정): F1 타워 문법의 밝은 버전.
// 1대1 = WIN/LOSE 두 행(로컬 데이터만으로), 그룹 = /result 를 불러 톱3 행(+내가
// 톱3 밖이면 내 행 추가). 전체 명단·상세는 카드 탭 → 전용 결과 화면 몫.

type RunMatchResultCardProps = RunMatchResultCardModelInput & {
  // 기록 주인의 닉네임 — 듀얼 보드의 내 행 이름 (오너 2026-08-28: '나' 표기 폐지).
  // 친구 기록 화면에서는 친구 이름, 내 기록에서는 내 프로필 이름이 들어온다.
  ownerName?: string | null;
};

const RANK_LEAD_COLOR: Record<number, string> = {
  1: colors.podiumGold,
  2: colors.podiumSilver,
  3: colors.podiumBronze,
};

function BoardRow({ row }: { row: MatchBoardRow }) {
  const rankColor = row.rankNumber ? RANK_LEAD_COLOR[row.rankNumber] : undefined;
  const nameText = (
    <Text style={[styles.rowName, row.isMe ? styles.rowNameMe : null]} numberOfLines={1}>
      {row.name}
    </Text>
  );

  return (
    <View style={[styles.row, row.isMe ? styles.rowMe : null]}>
      {row.leadTone === 'rank' ? (
        <Text style={[styles.rankLead, rankColor ? { color: rankColor } : null]}>{row.leadLabel}</Text>
      ) : (
        <View
          style={[
            styles.outcomeBadge,
            row.leadTone === 'win'
              ? styles.outcomeBadgeWin
              : row.leadTone === 'lose'
                ? styles.outcomeBadgeLose
                : styles.outcomeBadgeDraw,
          ]}
        >
          <Text
            style={[
              styles.outcomeBadgeText,
              row.leadTone !== 'win' ? styles.outcomeBadgeTextMuted : null,
            ]}
          >
            {row.leadLabel}
          </Text>
        </View>
      )}
      <View style={styles.rowBody}>
        {/* 상대 이름 탭 → 프로필 (오너 2026-08-06: 별도 프로필 버튼 대신). 카드 전체
            Pressable 안의 중첩 Pressable — 터치는 더 안쪽이 가져가므로 이름은 프로필,
            그 외 영역은 결과 화면으로 자연 분리된다. */}
        {row.userId ? (
          <Link
            href={{ pathname: '/opponent-profile', params: { userId: row.userId, name: row.name } }}
            asChild
          >
            <Pressable
              hitSlop={spacing.xs}
              accessibilityRole="button"
              accessibilityLabel={`${row.name} 프로필 보기`}
              style={styles.nameTapArea}
            >
              {nameText}
            </Pressable>
          </Link>
        ) : nameText}
        {row.metricLabel ? <Text style={styles.rowMetric}>{row.metricLabel}</Text> : null}
      </View>
    </View>
  );
}

function RunMatchResultCardBase({
  matchResult,
  myPaceLabel,
  myDurationSeconds,
  matchId,
  mode,
  ownerName,
}: RunMatchResultCardProps) {
  // All display derivation (link target, LP gating, labels) is pure and pinned by
  // runMatchResultCardModel.test.ts.
  const {
    resultMatchId,
    resultMode,
    canOpenResult,
    myDisplayPaceLabel,
    myDurationLabel,
    opponentDurationLabel,
    lpDelta,
    isLpGain,
    showLp,
    typeLabel,
    showDuelComparison,
    gapText,
    groupRankText,
  } = buildRunMatchResultCardModel({ matchResult, myPaceLabel, myDurationSeconds, matchId, mode });

  const duelRows = useMemo(
    () => (showDuelComparison
      ? buildDuelBoardRows({ matchResult, myDisplayPaceLabel, myDurationLabel, opponentDurationLabel, ownerName })
      : []),
    [matchResult, myDisplayPaceLabel, myDurationLabel, opponentDurationLabel, ownerName, showDuelComparison],
  );

  // 그룹 톱3 명단은 기록 blob 에 저장돼 있지 않아 결과 화면과 같은 /result 로 불러온다.
  // 로딩/실패 동안은 "N명 중 R위" 요약이 자리를 지킨다 — 보드가 막히는 일은 없다.
  const [groupRows, setGroupRows] = useState<MatchBoardRow[] | null>(null);
  const isGroup = matchResult.mode === 'group';
  useEffect(() => {
    if (!isGroup || !resultMatchId) {
      return undefined;
    }
    let cancelled = false;
    fetchMatchResult(resultMatchId)
      .then((result) => {
        if (!cancelled) {
          setGroupRows(buildGroupBoardRows(result.participants));
        }
      })
      .catch(() => {
        // 요약 폴백 유지 — 결과 미확정(집계 중)이나 네트워크 실패 모두 조용히.
      });
    return () => {
      cancelled = true;
    };
  }, [isGroup, resultMatchId]);

  const card = (
    <Card style={styles.boardCard}>
      <View style={styles.headerRow}>
        <Text style={styles.typeLabel}>{typeLabel}</Text>
        {showLp ? (
          <View style={[styles.lpPill, isLpGain ? styles.lpPillGain : styles.lpPillLoss]}>
            <Text style={[styles.lpPillText, isLpGain ? styles.lpPillTextGain : styles.lpPillTextLoss]}>
              랭크 {isLpGain ? '+' : ''}{lpDelta} LP
            </Text>
          </View>
        ) : null}
      </View>

      {/* §3-⑨ fair-verdict notices — display-only flags set ONLY on the run-detail reconcile
          overlay (never persisted); absent everywhere else, so nothing renders then. */}
      {matchResult.provisional ? (
        <Text style={styles.provisionalNotice}>{MATCH_PROVISIONAL_NOTICE_LABEL}</Text>
      ) : null}
      {matchResult.revised ? (
        <Text style={styles.revisedNotice}>{MATCH_REVISED_NOTICE_LABEL}</Text>
      ) : null}

      {showDuelComparison ? (
        <View style={styles.rowList}>
          {duelRows.map((row) => <BoardRow key={row.key} row={row} />)}
        </View>
      ) : null}

      {isGroup ? (
        groupRows && groupRows.length ? (
          <View style={styles.rowList}>
            {groupRows.map((row) => <BoardRow key={row.key} row={row} />)}
          </View>
        ) : (
          groupRankText ? <Text style={styles.meta}>{groupRankText}</Text> : null
        )
      ) : null}

      <View style={styles.footerRow}>
        {gapText ? <Text style={styles.meta}>{gapText}</Text> : <View />}
        {canOpenResult ? <Text style={styles.resultLinkText}>결과 자세히 보기 ›</Text> : null}
      </View>
    </Card>
  );

  // The whole card opens the dedicated match-result screen, fetched by matchId from the
  // backend (works for both duel and group, official and party). Falls back to a static
  // card only when matchId is absent (old records without run.matchResult.matchId).
  // 상대 프로필은 행의 이름 탭이 담당한다 (별도 링크 버튼 제거 — 오너 2026-08-06).
  if (!canOpenResult || !resultMatchId) {
    return card;
  }

  return (
    <Link
      href={{
        pathname: '/match-result',
        params: {
          matchId: resultMatchId,
          ...(resultMode ? { matchMode: resultMode } : {}),
        },
      }}
      asChild
    >
      <Pressable accessibilityRole="button" style={styles.pressable}>
        {card}
      </Pressable>
    </Link>
  );
}

export const RunMatchResultCard = memo(RunMatchResultCardBase);

const styles = StyleSheet.create({
  pressable: {
    flex: 1,
  },
  boardCard: {
    flex: 1,
    gap: spacing.s12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s12,
  },
  typeLabel: {
    color: colors.textPrimary,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
  lpPill: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.sm,
  },
  lpPillGain: {
    backgroundColor: fixedColors.successCard,
  },
  lpPillLoss: {
    backgroundColor: fixedColors.dangerSurface,
  },
  lpPillText: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  lpPillTextGain: {
    color: fixedColors.successText,
  },
  lpPillTextLoss: {
    color: fixedColors.dangerDeep,
  },
  provisionalNotice: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  revisedNotice: {
    color: fixedColors.dangerDeep,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  rowList: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s10,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.s10,
  },
  rowBody: {
    flex: 1,
    gap: spacing.xxs,
  },
  nameTapArea: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  rowMe: {
    backgroundColor: fixedColors.brandWashStrong,
  },
  rankLead: {
    width: 22,
    color: colors.textSecondary,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.black,
    textAlign: 'center',
  },
  outcomeBadge: {
    minWidth: 56,
    alignItems: 'center',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.xs,
  },
  outcomeBadgeWin: {
    backgroundColor: fixedColors.success,
  },
  outcomeBadgeLose: {
    backgroundColor: fixedColors.borderMuted,
  },
  outcomeBadgeDraw: {
    backgroundColor: fixedColors.borderMuted,
  },
  outcomeBadgeText: {
    color: fixedColors.white,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.black,
  },
  outcomeBadgeTextMuted: {
    color: fixedColors.textSecondary,
  },
  rowName: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  rowNameMe: {
    color: fixedColors.brandDeep,
    fontWeight: fontWeights.extraBold,
  },
  rowMetric: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    fontVariant: ['tabular-nums'],
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s12,
  },
  meta: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  resultLinkText: {
    color: fixedColors.brand,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
});
