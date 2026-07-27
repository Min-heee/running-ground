// 경기장 상세 화면 (오너 2026-07-28: 카드 안 미리보기 대신 별도 화면으로) — 러닝 탭에서
// 경기장을 누르면 여기로 넘어와 라이브 미리보기 지도(익명 점, 10초 폴링)를 크게 보고,
// 아래 '러닝 시작'을 누르면 원샷 신호(requestChaseAutoStart)를 남기고 러닝 탭으로 복귀,
// 탭에 살아 있는 시작 플로우(입장→GPS)가 신호를 집어 바로 시작한다.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AuthHeader } from '@/components/ui/AuthHeader';
import {
  getSelectedChaseArena,
  requestChaseAutoStart,
  subscribeChaseRunContext,
} from '@/features/runs/chase/chaseRunContext';
import { ChaseLiveMapView } from '@/features/runs/chase/ChaseLiveMapView';
import { toAnonymousParticipants } from '@/features/runs/chase/chaseOverviewParticipants';
import { fetchChaseOverview } from '@/services';
import type { ChaseOverviewResponse } from '@/lib/api/types';
import { colors, fixedColors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';

const OVERVIEW_TICK_MS = 10_000;

export default function ChaseArenaScreen() {
  const arena = useSyncExternalStore(
    subscribeChaseRunContext,
    getSelectedChaseArena,
    getSelectedChaseArena,
  );
  const [overview, setOverview] = useState<ChaseOverviewResponse | null>(null);
  const tickInFlightRef = useRef(false);

  // 선택 없이 직접 진입(딥링크/복원)하면 볼 게 없다 — 러닝 탭으로.
  useEffect(() => {
    if (!arena) {
      router.replace('/(tabs)/running');
    }
  }, [arena]);

  useEffect(() => {
    if (!arena) {
      return;
    }

    let cancelled = false;

    const tick = async () => {
      if (tickInFlightRef.current) {
        return;
      }

      tickInFlightRef.current = true;

      try {
        const data = await fetchChaseOverview(arena.id);

        if (!cancelled) {
          setOverview(data);
        }
      } catch {
        // 일시 실패는 다음 틱이 만회.
      } finally {
        tickInFlightRef.current = false;
      }
    };

    void tick();
    const interval = setInterval(() => {
      void tick();
    }, OVERVIEW_TICK_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [arena]);

  if (!arena) {
    return null;
  }

  const runningCount = overview?.runners.length ?? 0;
  const isFull = overview !== null && overview.currentCount >= overview.capacity;

  return (
    <Screen>
      <AuthHeader title="경기장" showBack backHref="/(tabs)/running" />

      <View style={styles.titleRow}>
        <View style={styles.titleMeta}>
          <Text style={styles.title}>{arena.name}</Text>
          <Text style={styles.subtitle}>
            {runningCount > 0 ? `지금 ${runningCount}명이 달리는 중` : '지금은 조용해요'}
          </Text>
        </View>
        <Text style={styles.countLabel}>
          {overview ? `${overview.currentCount}/${overview.capacity}` : '…'}
        </Text>
      </View>

      <View style={styles.mapWrap}>
        <ChaseLiveMapView
          latitude={arena.latitude}
          longitude={arena.longitude}
          radiusM={arena.radiusM}
          participants={toAnonymousParticipants(overview)}
        />
      </View>

      {/* 시작 신호를 남기고 러닝 탭으로 복귀 — 탭의 ChaseSetupCard가 신호를 집어
          기존 시작 플로우(입장→GPS)를 태운다. 정원 최종 판정은 서버(join 400). */}
      <Pressable
        onPress={() => {
          requestChaseAutoStart();
          router.back();
        }}
        disabled={isFull}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.startButton,
          pressed ? styles.startButtonPressed : null,
          isFull ? styles.startButtonDisabled : null,
        ]}
      >
        <Text style={styles.startButtonLabel}>{isFull ? '정원 마감' : '러닝 시작'}</Text>
      </Pressable>

      <Text style={styles.rulesText}>
        따라잡기 +10P · 마주침 +5P — 시작하면 내 위치도 지도에 공유되고, 스침은 러닝이 끝나면
        자동 정산돼요.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.s12,
  },
  titleMeta: {
    gap: 2,
    flex: 1,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.pageTitle,
    fontWeight: fontWeights.extraBold,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
  countLabel: {
    color: fixedColors.brand,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.black,
  },
  mapWrap: {
    height: 420,
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: '#0A0E1E',
  },
  startButton: {
    borderRadius: radii.lg,
    paddingVertical: spacing.s16,
    alignItems: 'center',
    backgroundColor: fixedColors.brand,
  },
  startButtonPressed: {
    opacity: 0.85,
  },
  startButtonDisabled: {
    opacity: 0.5,
  },
  startButtonLabel: {
    color: colors.white,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
  rulesText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 19,
  },
});
