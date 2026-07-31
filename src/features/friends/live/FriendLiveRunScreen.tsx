// 친구 라이브 러닝 화면 (오너 2026-07-31) — 친구 카드의 라이브 ON 버튼으로 들어온다.
// 위: 실시간 지도(친구 마커), 아래: 현황(거리/페이스/경과) + 응원 보내기(칩 + 직접 입력).
//
// 폴링 10초: 러너의 하트비트가 25초라 그보다 촘촘히 봐야 갱신을 놓치지 않는다. 화면을
// 떠나면 즉시 멈춘다. 친구가 러닝을 끝내면(isRunningNow=false) 지도 대신 종료 카드.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import type { FriendLiveRunResponse } from '@/lib/api/types';
import { fetchFriendLiveRun, getApiErrorMessage, sendFriendCheer } from '@/services';
import { colors, fixedColors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';
import { FriendLiveMapView } from './FriendLiveMapView';

const POLL_INTERVAL_MS = 10_000;
const CHEER_MAX_LENGTH = 60;
const QUICK_CHEERS = ['힘내! 💪', '페이스 좋아요!', '거의 다 왔어요!', '오늘도 멋져요 🔥'];

function formatElapsedLabel(startedAt?: string): string | null {
  if (!startedAt) {
    return null;
  }

  const startedMs = Date.parse(startedAt);

  if (!Number.isFinite(startedMs)) {
    return null;
  }

  const minutes = Math.max(0, Math.round((Date.now() - startedMs) / 60_000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}시간 ${minutes % 60}분째` : `${minutes}분째`;
}

export default function FriendLiveRunScreen() {
  const { friendId, friendName } = useLocalSearchParams<{ friendId?: string; friendName?: string }>();
  const [liveRun, setLiveRun] = useState<FriendLiveRunResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cheerText, setCheerText] = useState('');
  const [sending, setSending] = useState(false);
  const [cheerFeedback, setCheerFeedback] = useState<string | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const normalizedFriendId = typeof friendId === 'string' ? friendId : '';

  useEffect(() => {
    if (!normalizedFriendId) {
      return undefined;
    }

    let active = true;

    const poll = async () => {
      try {
        const payload = await fetchFriendLiveRun(normalizedFriendId);

        if (active) {
          setLiveRun(payload);
          setLoadError(null);
        }
      } catch (error) {
        if (active) {
          setLoadError(getApiErrorMessage(error, '친구의 러닝을 불러오지 못했어요.'));
        }
      }
    };

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [normalizedFriendId]);

  useEffect(() => () => {
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
    }
  }, []);

  const displayName = liveRun?.name ?? (typeof friendName === 'string' ? friendName : '친구');
  const ageSeconds = useMemo(() => {
    const updatedMs = Date.parse(liveRun?.updatedAt ?? '');
    return Number.isFinite(updatedMs) ? Math.max(0, Math.round((Date.now() - updatedMs) / 1000)) : 0;
  }, [liveRun?.updatedAt]);
  const elapsedLabel = formatElapsedLabel(liveRun?.startedAt);

  const showCheerFeedback = useCallback((message: string) => {
    setCheerFeedback(message);

    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
    }

    feedbackTimerRef.current = setTimeout(() => setCheerFeedback(null), 2_500);
  }, []);

  const sendCheer = useCallback(async (message: string) => {
    const trimmed = message.trim();

    if (!trimmed || sending || !normalizedFriendId) {
      return;
    }

    setSending(true);

    try {
      await sendFriendCheer({ friendId: normalizedFriendId, message: trimmed });
      setCheerText('');
      showCheerFeedback('응원을 보냈어요! 러닝 중에 음성으로 들려요.');
    } catch (error) {
      showCheerFeedback(getApiErrorMessage(error, '응원을 보내지 못했어요.'));
    } finally {
      setSending(false);
    }
  }, [normalizedFriendId, sending, showCheerFeedback]);

  const handleSendTyped = useCallback(() => {
    void sendCheer(cheerText);
  }, [cheerText, sendCheer]);

  return (
    <Screen>
      <AuthHeader
        title={`${displayName}님의 라이브 러닝`}
        subtitle="응원 메시지는 달리는 친구에게 음성으로 전해져요."
        showBack
        backHref="/(tabs)/friends"
      />

      {!liveRun && !loadError ? <ActivityIndicator size="large" color={colors.brand} /> : null}
      {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}

      {liveRun && !liveRun.isRunningNow ? (
        <Card>
          <Text style={styles.endedTitle}>지금은 달리고 있지 않아요</Text>
          <Text style={styles.endedText}>러닝이 끝났거나 라이브 공유가 꺼져 있어요.</Text>
        </Card>
      ) : null}

      {liveRun?.isRunningNow ? (
        <>
          <View style={styles.mapWrap}>
            {typeof liveRun.latitude === 'number' && typeof liveRun.longitude === 'number' ? (
              <FriendLiveMapView
                latitude={liveRun.latitude}
                longitude={liveRun.longitude}
                friendName={displayName}
                ageSeconds={ageSeconds}
              />
            ) : (
              <View style={styles.mapPending}>
                <ActivityIndicator color={colors.brand} />
                <Text style={styles.mapPendingText}>친구의 위치를 기다리는 중…</Text>
              </View>
            )}
          </View>

          <Card>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>거리</Text>
                <Text style={styles.statValue}>
                  {typeof liveRun.distanceKm === 'number' ? `${liveRun.distanceKm.toFixed(2)}km` : '--'}
                </Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statLabel}>페이스</Text>
                <Text style={styles.statValue}>{liveRun.paceLabel ?? '--:--/km'}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statLabel}>달린 지</Text>
                <Text style={styles.statValue}>{elapsedLabel ?? '--'}</Text>
              </View>
            </View>
          </Card>

          {liveRun.allowCheers === false ? (
            <Card>
              <Text style={styles.endedText}>응원 메시지를 받지 않는 친구예요.</Text>
            </Card>
          ) : (
            <Card style={styles.cheerCard}>
              <Text style={styles.cheerTitle}>응원 보내기</Text>
              <View style={styles.quickRow}>
                {QUICK_CHEERS.map((quick) => (
                  <Pressable
                    key={quick}
                    style={[styles.quickChip, sending ? styles.quickChipDisabled : undefined]}
                    onPress={() => {
                      void sendCheer(quick);
                    }}
                    disabled={sending}
                    accessibilityRole="button"
                  >
                    <Text style={styles.quickChipText}>{quick}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.cheerInputRow}>
                <TextInput
                  value={cheerText}
                  onChangeText={setCheerText}
                  placeholder="직접 입력 (60자까지)"
                  placeholderTextColor={colors.textTertiary}
                  maxLength={CHEER_MAX_LENGTH}
                  editable={!sending}
                  style={styles.cheerInput}
                  onSubmitEditing={handleSendTyped}
                  returnKeyType="send"
                />
                <Pressable
                  style={[styles.sendButton, sending || !cheerText.trim() ? styles.sendButtonDisabled : undefined]}
                  onPress={handleSendTyped}
                  disabled={sending || !cheerText.trim()}
                  accessibilityRole="button"
                >
                  <Text style={styles.sendButtonText}>{sending ? '전송 중' : '보내기'}</Text>
                </Pressable>
              </View>
              {cheerFeedback ? <Text style={styles.cheerFeedback}>{cheerFeedback}</Text> : null}
            </Card>
          )}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  mapWrap: {
    height: 300,
    borderRadius: radii.xl,
    overflow: 'hidden',
  },
  mapPending: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s10,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mapPendingText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xxs,
  },
  statLabel: {
    color: colors.textTertiary,
    fontSize: fontSizes.sm,
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.large,
    fontWeight: fontWeights.extraBold,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
  },
  cheerCard: {
    gap: spacing.s12,
  },
  cheerTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxl,
  },
  quickChip: {
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s10,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(109, 94, 247, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(142, 123, 255, 0.45)',
  },
  quickChipDisabled: {
    opacity: 0.5,
  },
  quickChipText: {
    color: colors.brandDeep,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
  },
  cheerInputRow: {
    flexDirection: 'row',
    gap: spacing.xxl,
  },
  cheerInput: {
    flex: 1,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s12,
    color: colors.textPrimary,
    fontSize: fontSizes.base,
  },
  sendButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s16,
    borderRadius: radii.lg,
    backgroundColor: fixedColors.brand,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: fixedColors.white,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  cheerFeedback: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
  errorText: {
    color: colors.danger,
    fontWeight: fontWeights.bold,
  },
  endedTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  endedText: {
    color: colors.textSecondary,
  },
});
