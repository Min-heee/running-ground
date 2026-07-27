// 경찰과 도둑 모드 셋업 카드 — 경기장 목록만 보여주고, 누르면 별도 화면(/chase-arena)으로
// 넘어간다 (오너 2026-07-28: 카드 안 미리보기 대신 화면 전환). 러닝 시작은 그 화면의
// 버튼이 원샷 신호(requestChaseAutoStart)를 남기고 복귀하면, 러닝 탭에 마운트된 이 카드가
// 신호를 집어 기존 시작 플로우(입장→GPS)를 태운다 — 시작 로직은 탭 런타임에만 산다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  consumeChaseAutoStart,
  setSelectedChaseArena,
  subscribeChaseRunContext,
} from '@/features/runs/chase/chaseRunContext';
import { fetchChaseArenas } from '@/services';
import { getApiErrorMessage } from '@/services/apiError';
import type { ChaseArenaSummary } from '@/lib/api/types';
import { colors, fixedColors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';

export function ChaseSetupCard({ onStartRun }: { onStartRun?: () => void }) {
  const [arenas, setArenas] = useState<ChaseArenaSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadEpochRef = useRef(0);
  const onStartRunRef = useRef(onStartRun);
  onStartRunRef.current = onStartRun;

  const loadArenas = useCallback(async () => {
    const epoch = loadEpochRef.current + 1;
    loadEpochRef.current = epoch;
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetchChaseArenas();

      if (loadEpochRef.current !== epoch) {
        return;
      }

      setArenas(response.arenas);
    } catch (fetchError) {
      if (loadEpochRef.current !== epoch) {
        return;
      }

      setError(getApiErrorMessage(fetchError, '경기장 목록을 불러오지 못했어요.'));
    } finally {
      if (loadEpochRef.current === epoch) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadArenas();
  }, [loadArenas]);

  // 경기장 화면에서 남긴 '러닝 시작' 원샷 신호 소비 — 마운트 시 + 컨텍스트 변경 시.
  useEffect(() => {
    const maybeStart = () => {
      if (consumeChaseAutoStart()) {
        onStartRunRef.current?.();
      }
    };

    maybeStart();
    return subscribeChaseRunContext(maybeStart);
  }, []);

  return (
    <View style={styles.card}>
      {isLoading ? <ActivityIndicator color={colors.brandLight} /> : null}
      {error ? (
        <>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void loadArenas()} hitSlop={8} accessibilityRole="button">
            <Text style={styles.retryLabel}>다시 불러오기</Text>
          </Pressable>
        </>
      ) : null}

      {!isLoading && !error
        ? arenas.map((arena) => (
            <Pressable
              key={arena.id}
              accessibilityRole="button"
              onPress={() => {
                setSelectedChaseArena(arena);
                router.push('/chase-arena' as never);
              }}
              style={({ pressed }) => [styles.arenaRow, pressed ? styles.arenaRowPressed : null]}
            >
              <View style={styles.arenaMeta}>
                <Text style={styles.arenaName}>{arena.name}</Text>
                <Text style={styles.arenaRegion}>{arena.regionLabel}</Text>
              </View>
              <Text style={styles.arenaCount}>{`${arena.currentCount}/${arena.capacity}`}</Text>
            </Pressable>
          ))
        : null}

      {!isLoading && !error ? (
        <Text style={styles.helperText}>경기장을 누르면 라이브 지도로 넘어가요.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // MatchSetupSection의 다크 카드 안에 앉는 서브 카드 — 셋업 카드들과 같은 결.
  card: {
    gap: spacing.s10,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.darkSoft,
    backgroundColor: fixedColors.textPrimary,
    padding: spacing.s12,
  },
  errorText: {
    color: colors.dangerAccent,
    fontSize: fontSizes.sm,
  },
  retryLabel: {
    color: colors.brandLighter,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  arenaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s12,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(142, 123, 255, 0.45)',
    backgroundColor: 'rgba(109, 94, 247, 0.16)',
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s12,
  },
  arenaRowPressed: {
    backgroundColor: 'rgba(109, 94, 247, 0.28)',
    borderColor: fixedColors.brand,
  },
  arenaMeta: {
    flex: 1,
    gap: 2,
  },
  arenaName: {
    color: colors.white,
    fontWeight: fontWeights.extraBold,
  },
  arenaRegion: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: fontSizes.sm,
  },
  arenaCount: {
    color: colors.brandLighter,
    fontWeight: fontWeights.extraBold,
  },
  helperText: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: fontSizes.sm,
  },
});
