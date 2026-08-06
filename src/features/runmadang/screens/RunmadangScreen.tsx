import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthHeader } from '@/components/ui/AuthHeader';
import { BrandLoadingView } from '@/components/BrandLoadingView';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/Screen';
import {
  declineRunmadang,
  fetchRunmadangMine,
  getApiErrorMessage,
  joinRunmadang,
} from '@/services';
import type { RunmadangChallenge, RunmadangMineResponse } from '@/lib/api/types/runmadang';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';
import {
  buildRunmadangResultLine,
  formatRunmadangPeriod,
  formatRunmadangRemaining,
  splitRunmadangSections,
} from '../runmadangModel';

// 그라운드 (오너 2026-08-06): 친구와 기간을 정해 거리/시간 총합으로 겨루는 포인트 내기.
// 목록 = 초대받은 판 / 진행 중 / 지난 판. 20초 폴링 (친구탭과 같은 리듬).

const POLL_INTERVAL_MS = 20_000;
const METRIC_TITLES = { distance: '거리 대결', duration: '시간 대결' } as const;

export default function RunmadangScreen() {
  const [data, setData] = useState<RunmadangMineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionChallengeId, setActionChallengeId] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  // 액션(참가/거절/취소/철회) 응답이 도착한 뒤, 그보다 먼저 발사됐던 폴링 응답이 늦게
  // 도착해 화면을 낡은 상태로 되돌리는 경합 방지 — 액션 성공 시 세대를 올려 이전 세대
  // 폴링 응답을 버린다 (적대 리뷰).
  const dataSeqRef = useRef(0);
  // Alert 이중 탭·연타 가드는 state가 아니라 ref로 — state는 같은 렌더 배치에서 낡은
  // 값이라 두 번째 호출을 못 막는다 (적대 리뷰).
  const actionInFlightRef = useRef(false);

  const loadChallenges = useCallback(async () => {
    const seq = dataSeqRef.current;
    try {
      const response = await fetchRunmadangMine();
      if (seq !== dataSeqRef.current) {
        return; // 이 응답보다 새로운 액션 결과가 이미 반영됨
      }
      setData(response);
      setError(null);
      hasLoadedRef.current = true;
    } catch (loadError) {
      if (!hasLoadedRef.current) {
        setError(getApiErrorMessage(loadError, '그라운드 목록을 불러오지 못했어요.'));
      }
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      void loadChallenges();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loadChallenges]);

  // 마운트 + 화면 복귀(만들기에서 돌아올 때) 모두 즉시 갱신.
  useFocusEffect(useCallback(() => {
    void loadChallenges();
  }, [loadChallenges]));

  const runAction = useCallback(async (
    challengeId: string,
    action: (id: string) => Promise<RunmadangMineResponse>,
    failMessage: string,
  ) => {
    if (actionInFlightRef.current) {
      return;
    }
    actionInFlightRef.current = true;
    setActionChallengeId(challengeId);
    try {
      const response = await action(challengeId);
      dataSeqRef.current += 1;
      setData(response);
    } catch (actionError) {
      Alert.alert('그라운드', getApiErrorMessage(actionError, failMessage));
    } finally {
      actionInFlightRef.current = false;
      setActionChallengeId(null);
    }
  }, []);

  const handleJoin = useCallback((challenge: RunmadangChallenge) => {
    const stakeLine = challenge.stakePoints > 0
      ? `판돈 ${challenge.stakePoints}P를 걸고 참가할까요? 참가하면 종료까지 판돈이 잠겨요.`
      : '판돈 없이 참가할까요?';
    Alert.alert('그라운드 참가', stakeLine, [
      { text: '취소', style: 'cancel' },
      {
        text: '참가',
        onPress: () => {
          void runAction(challenge.id, joinRunmadang, '그라운드에 참가하지 못했어요.');
        },
      },
    ]);
  }, [runAction]);

  const handleDecline = useCallback((challenge: RunmadangChallenge) => {
    void runAction(challenge.id, declineRunmadang, '초대를 거절하지 못했어요.');
  }, [runAction]);

  if (!data && !error) {
    return <BrandLoadingView />;
  }

  const sections = splitRunmadangSections(data?.challenges ?? []);
  const nowMs = Date.now();

  return (
    <Screen>
      <AuthHeader
        title="그라운드"
        subtitle="기간을 정해 친구와 포인트를 걸고, 더 많이 달린 사람이 가져가요."
        showBack
        backHref="/(tabs)/friends"
      />

      {error ? (
        <Card>
          <Text style={styles.errorText}>{error}</Text>
          <PrimaryButton label="다시 불러오기" onPress={() => { void loadChallenges(); }} />
        </Card>
      ) : null}

      {data ? (
        <>
          {/* 상단 카드 (오너 2026-08-07): 왼쪽 = 보유 포인트 크게, 오른쪽 = 만들기 버튼
              (버튼이 글자에 딱 붙지 않게 고정 폭으로 여유). */}
          <Card style={styles.createCard}>
            <View style={styles.createCopy}>
              <Text style={styles.balanceLabel}>보유 포인트</Text>
              <Text style={styles.balanceValue}>
                {Math.max(0, Math.round(data.availablePoints)).toLocaleString()}P
              </Text>
            </View>
            <View style={styles.createButtonWrap}>
              <PrimaryButton label="그라운드 만들기" onPress={() => router.push('/runmadang-create')} />
            </View>
          </Card>

          {sections.invited.length > 0 ? (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>초대받은 판</Text>
              {sections.invited.map((challenge) => (
                <ChallengeCard
                  key={challenge.id}
                  challenge={challenge}
                  nowMs={nowMs}
                  busy={actionChallengeId === challenge.id}
                  onJoin={handleJoin}
                  onDecline={handleDecline}
                />
              ))}
            </View>
          ) : null}

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>진행 중</Text>
            {sections.active.length === 0 ? (
              <Card>
                <Text style={styles.emptyText}>
                  진행 중인 판이 없어요. 친구를 초대해 첫 판을 벌여보세요!
                </Text>
              </Card>
            ) : sections.active.map((challenge) => (
              <ChallengeCard
                key={challenge.id}
                challenge={challenge}
                nowMs={nowMs}
                busy={actionChallengeId === challenge.id}
                onJoin={handleJoin}
                onDecline={handleDecline}
              />
            ))}
          </View>

          {sections.closed.length > 0 ? (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>지난 판</Text>
              {sections.closed.map((challenge) => (
                <ChallengeCard
                  key={challenge.id}
                  challenge={challenge}
                  nowMs={nowMs}
                  busy={actionChallengeId === challenge.id}
                  onJoin={handleJoin}
                  onDecline={handleDecline}
                />
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function ChallengeCard({
  challenge,
  nowMs,
  busy,
  onJoin,
  onDecline,
}: {
  challenge: RunmadangChallenge;
  nowMs: number;
  busy: boolean;
  onJoin: (challenge: RunmadangChallenge) => void;
  onDecline: (challenge: RunmadangChallenge) => void;
}) {
  const resultLine = buildRunmadangResultLine(challenge);
  const isLive = challenge.status === 'running' || challenge.status === 'upcoming';

  // 카드는 간결하게(순위 없음) — 누르면 상세에서 순위가 쫙 (오너 2026-08-07).
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/runmadang-detail', params: { challengeId: challenge.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${challenge.title?.trim() || METRIC_TITLES[challenge.metric]} 상세 보기`}
    >
      <Card style={styles.challengeCard}>
        <View style={styles.challengeHeaderRow}>
          {/* 판 이름 (오너 2026-08-06) — 이름 도입 전 구서버 판은 종목 기본명 폴백. */}
          <Text numberOfLines={1} style={styles.challengeTitle}>
            {challenge.title?.trim() || METRIC_TITLES[challenge.metric]}
          </Text>
          <View style={styles.potPill}>
            <Text style={styles.potPillText}>
              {challenge.stakePoints > 0 ? `판돈 ${challenge.potPoints}P` : '판돈 없음'}
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </View>

        <Text style={styles.periodText}>
          {METRIC_TITLES[challenge.metric]}
          {' · '}
          {formatRunmadangPeriod(challenge.startAt, challenge.endAt)}
          {isLive ? ` · ${challenge.status === 'upcoming' ? '시작 전' : formatRunmadangRemaining(challenge.endAt, nowMs)}` : ''}
        </Text>

        {resultLine ? <Text style={styles.resultLine}>{resultLine}</Text> : null}

        {challenge.myRole === 'invited' ? (
          <Text style={styles.inviteHint}>{challenge.hostName}님의 초대 · 눌러서 확인하고 참가해요</Text>
        ) : null}

        {challenge.canJoin ? (
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.actionButton, styles.declineButton]}
              onPress={() => onDecline(challenge)}
              disabled={busy}
            >
              <Text style={styles.declineButtonText}>거절</Text>
            </Pressable>
            <Pressable
              style={[styles.actionButton, styles.joinButton, busy ? styles.actionBusy : null]}
              onPress={() => onJoin(challenge)}
              disabled={busy}
            >
              <Text style={styles.joinButtonText}>
                {challenge.stakePoints > 0 ? `${challenge.stakePoints}P 걸고 참가` : '참가하기'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  errorText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    marginBottom: spacing.s12,
  },
  createCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s12,
  },
  createCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  balanceLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  balanceValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.metric,
    fontWeight: fontWeights.extraBold,
    includeFontPadding: false,
  },
  createButtonWrap: {
    width: 164,
  },
  sectionBlock: {
    gap: spacing.s10,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
    marginLeft: spacing.sm,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 20,
  },
  challengeCard: {
    gap: spacing.s10,
  },
  challengeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s10,
  },
  challengeTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  potPill: {
    backgroundColor: colors.brandWash,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.md,
  },
  potPillText: {
    color: colors.brandStrong,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  periodText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  resultLine: {
    color: colors.brandDeep,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  chevron: {
    color: colors.textTertiary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  inviteHint: {
    color: colors.textTertiary,
    fontSize: fontSizes.xs,
    marginTop: spacing.xs,
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
});
