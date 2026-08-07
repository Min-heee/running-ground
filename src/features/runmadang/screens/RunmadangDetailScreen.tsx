import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthHeader } from '@/components/ui/AuthHeader';
import { BrandLoadingView } from '@/components/BrandLoadingView';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/Screen';
import {
  cancelRunmadang,
  declineRunmadang,
  fetchRunmadangMine,
  getApiErrorMessage,
  hideRunmadang,
  joinRunmadang,
  withdrawRunmadang,
} from '@/services';
import type { RunmadangChallenge, RunmadangMineResponse } from '@/lib/api/types/runmadang';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';
import {
  buildRunmadangResultLine,
  formatRunmadangPeriod,
  formatRunmadangRemaining,
  formatRunmadangValue,
} from '../runmadangModel';

// 그라운드 상세 (오너 2026-08-07): 목록 카드는 간결하게, 순위는 이 화면에서 쫙.
// 맨 아래 = 역할/상태에 맞는 삭제 계열 버튼 (방장 삭제·참가 철회·목록에서 삭제).

const POLL_INTERVAL_MS = 20_000;
const METRIC_TITLES = { distance: '거리 대결', duration: '시간 대결' } as const;

export default function RunmadangDetailScreen() {
  const { challengeId } = useLocalSearchParams<{ challengeId?: string }>();
  const [data, setData] = useState<RunmadangMineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const hasLoadedRef = useRef(false);
  const dataSeqRef = useRef(0);
  const actionInFlightRef = useRef(false);

  const loadChallenges = useCallback(async () => {
    const seq = dataSeqRef.current;
    try {
      const response = await fetchRunmadangMine();
      if (seq !== dataSeqRef.current) {
        return;
      }
      setData(response);
      setError(null);
      hasLoadedRef.current = true;
    } catch (loadError) {
      if (!hasLoadedRef.current) {
        setError(getApiErrorMessage(loadError, '그라운드를 불러오지 못했어요.'));
      }
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      void loadChallenges();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loadChallenges]);

  useFocusEffect(useCallback(() => {
    void loadChallenges();
  }, [loadChallenges]));

  const runAction = useCallback(async (
    action: (id: string) => Promise<RunmadangMineResponse>,
    failMessage: string,
    options?: { goBackOnSuccess?: boolean },
  ) => {
    const id = typeof challengeId === 'string' ? challengeId : null;
    if (!id || actionInFlightRef.current) {
      return;
    }
    actionInFlightRef.current = true;
    setActionBusy(true);
    try {
      const response = await action(id);
      dataSeqRef.current += 1;
      setData(response);
      if (options?.goBackOnSuccess) {
        router.back();
      }
    } catch (actionError) {
      Alert.alert('그라운드', getApiErrorMessage(actionError, failMessage));
    } finally {
      actionInFlightRef.current = false;
      setActionBusy(false);
    }
  }, [challengeId]);

  if (!data && !error) {
    return <BrandLoadingView />;
  }

  const challenge = data?.challenges.find((entry) => entry.id === challengeId) ?? null;

  return (
    <Screen>
      <AuthHeader
        title={challenge ? (challenge.title?.trim() || METRIC_TITLES[challenge.metric]) : '그라운드'}
        subtitle={challenge ? `${METRIC_TITLES[challenge.metric]} · ${formatRunmadangPeriod(challenge.startAt, challenge.endAt)}` : undefined}
        showBack
        backHref="/runmadang"
      />

      {error ? (
        <Card>
          <Text style={styles.errorText}>{error}</Text>
          <PrimaryButton label="다시 불러오기" onPress={() => { void loadChallenges(); }} />
        </Card>
      ) : null}

      {data && !challenge ? (
        <Card>
          <Text style={styles.errorText}>이 그라운드를 찾을 수 없어요. 이미 삭제됐거나 정리된 판이에요.</Text>
        </Card>
      ) : null}

      {challenge ? <ChallengeDetail challenge={challenge} busy={actionBusy} runAction={runAction} /> : null}
    </Screen>
  );
}

function ChallengeDetail({
  challenge,
  busy,
  runAction,
}: {
  challenge: RunmadangChallenge;
  busy: boolean;
  runAction: (
    action: (id: string) => Promise<RunmadangMineResponse>,
    failMessage: string,
    options?: { goBackOnSuccess?: boolean },
  ) => Promise<void>;
}) {
  const nowMs = Date.now();
  const resultLine = buildRunmadangResultLine(challenge);
  const isLive = challenge.status === 'running' || challenge.status === 'upcoming';

  const handleJoin = () => {
    const stakeLine = challenge.stakePoints > 0
      ? `참가 포인트 ${challenge.stakePoints}P를 걸고 참가할까요? 참가하면 종료까지 포인트가 잠겨요.`
      : '참가 포인트 없이 참가할까요?';
    Alert.alert('그라운드 참가', stakeLine, [
      { text: '취소', style: 'cancel' },
      { text: '참가', onPress: () => { void runAction(joinRunmadang, '그라운드에 참가하지 못했어요.'); } },
    ]);
  };

  const handleDelete = () => {
    Alert.alert(
      '그라운드 삭제',
      '판을 삭제하면 모든 참가자의 참가 포인트가 환불되고 참가자에게 알림이 가요.',
      [
        { text: '닫기', style: 'cancel' },
        {
          text: '삭제하기',
          style: 'destructive',
          onPress: () => {
            void runAction(cancelRunmadang, '그라운드를 삭제하지 못했어요.', { goBackOnSuccess: true });
          },
        },
      ],
    );
  };

  const handleWithdraw = () => {
    Alert.alert('참가 철회', '시작 전이라 참가 포인트를 그대로 돌려받아요. 다시 참가할 수도 있어요.', [
      { text: '닫기', style: 'cancel' },
      {
        text: '철회하기',
        style: 'destructive',
        onPress: () => {
          void runAction(withdrawRunmadang, '참가를 철회하지 못했어요.', { goBackOnSuccess: true });
        },
      },
    ]);
  };

  const handleHide = () => {
    Alert.alert('목록에서 삭제', '내 목록에서만 사라져요. 다른 참가자에게는 그대로 남아요.', [
      { text: '닫기', style: 'cancel' },
      {
        text: '삭제하기',
        style: 'destructive',
        onPress: () => {
          void runAction(hideRunmadang, '목록에서 삭제하지 못했어요.', { goBackOnSuccess: true });
        },
      },
    ]);
  };

  return (
    <>
      <Card style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>상금</Text>
            <Text style={styles.summaryValue}>
              {challenge.stakePoints > 0 ? `${challenge.potPoints}P` : '없음'}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>참가</Text>
            <Text style={styles.summaryValue}>{challenge.participantCount}명</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>{challenge.status === 'upcoming' ? '시작' : '남은 기간'}</Text>
            <Text style={styles.summaryValue}>
              {challenge.status === 'upcoming'
                ? '시작 전'
                : isLive
                  ? formatRunmadangRemaining(challenge.endAt, nowMs)
                  : '종료'}
            </Text>
          </View>
        </View>
        {resultLine ? <Text style={styles.resultLine}>{resultLine}</Text> : null}
      </Card>

      <Card style={styles.standingsCard}>
        <Text style={styles.sectionTitle}>순위</Text>
        {challenge.standings.length === 0 ? (
          <Text style={styles.emptyText}>
            {challenge.myRole === 'invited'
              ? `${challenge.hostName}님의 초대 · 참가하면 순위가 보여요`
              : '아직 순위가 없어요.'}
          </Text>
        ) : challenge.standings.map((row) => {
          const isWinner = challenge.status === 'settled'
            && challenge.resultTone === 'win'
            && (challenge.winnerUserIds?.includes(row.userId) ?? false);
          return (
            <View key={row.userId} style={[styles.standingRow, row.isMe ? styles.standingRowMine : null]}>
              <Text style={styles.standingRank}>{row.rank}위</Text>
              <View style={styles.standingCopy}>
                <Text numberOfLines={1} style={[styles.standingName, row.isMe ? styles.standingNameMine : null]}>
                  {row.name}{isWinner ? ' 🏆' : ''}
                </Text>
                <Text style={styles.standingMeta}>{row.runCount}회 러닝</Text>
              </View>
              <Text style={styles.standingValue}>{formatRunmadangValue(challenge.metric, row.value)}</Text>
            </View>
          );
        })}
      </Card>

      {challenge.canJoin ? (
        <View style={styles.actionRow}>
          <Pressable
            style={[styles.actionButton, styles.declineButton]}
            onPress={() => { void runAction(declineRunmadang, '초대를 거절하지 못했어요.', { goBackOnSuccess: true }); }}
            disabled={busy}
          >
            <Text style={styles.declineButtonText}>거절</Text>
          </Pressable>
          <Pressable
            style={[styles.actionButton, styles.joinButton, busy ? styles.actionBusy : null]}
            onPress={handleJoin}
            disabled={busy}
          >
            <Text style={styles.joinButtonText}>
              {challenge.stakePoints > 0 ? `${challenge.stakePoints}P 걸고 참가` : '참가하기'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {challenge.canCancel ? (
        <Pressable
          style={[styles.deleteButton, busy ? styles.actionBusy : null]}
          onPress={handleDelete}
          disabled={busy}
        >
          <Text style={styles.deleteButtonText}>그라운드 삭제하기</Text>
        </Pressable>
      ) : challenge.canWithdraw ? (
        <Pressable
          style={[styles.deleteButton, busy ? styles.actionBusy : null]}
          onPress={handleWithdraw}
          disabled={busy}
        >
          <Text style={styles.deleteButtonText}>참가 철회하고 환불받기</Text>
        </Pressable>
      ) : challenge.canHide ? (
        <Pressable
          style={[styles.deleteButton, busy ? styles.actionBusy : null]}
          onPress={handleHide}
          disabled={busy}
        >
          <Text style={styles.deleteButtonText}>내 목록에서 삭제하기</Text>
        </Pressable>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  errorText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 20,
    marginBottom: spacing.s10,
  },
  summaryCard: {
    gap: spacing.s12,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    gap: spacing.xs,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    height: 26,
    backgroundColor: colors.borderMuted,
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  summaryValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
    includeFontPadding: false,
  },
  resultLine: {
    color: colors.brandDeep,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
    textAlign: 'center',
  },
  standingsCard: {
    gap: spacing.s10,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 20,
  },
  standingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s10,
    paddingVertical: spacing.s10,
    paddingHorizontal: spacing.s10,
    borderRadius: radii.md,
  },
  standingRowMine: {
    backgroundColor: colors.purpleRowSoft,
  },
  standingRank: {
    width: 38,
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  standingCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  standingName: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  standingNameMine: {
    fontWeight: fontWeights.extraBold,
  },
  standingMeta: {
    color: colors.textTertiary,
    fontSize: fontSizes.xs,
  },
  standingValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.s10,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    paddingVertical: spacing.s12,
  },
  actionBusy: {
    opacity: 0.55,
  },
  joinButton: {
    backgroundColor: colors.brand,
  },
  joinButtonText: {
    color: colors.white,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  declineButton: {
    backgroundColor: colors.surfaceMuted,
  },
  declineButtonText: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  deleteButton: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.dangerWash,
    backgroundColor: colors.dangerWash,
    paddingVertical: spacing.s14,
  },
  deleteButtonText: {
    color: colors.danger,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
});
