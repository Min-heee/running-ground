// 경찰과 도둑 모드 셋업 카드 — 경기장 목록(실시간 점유 30/100) + 선택.
// 자급자족 컴포넌트: 목록 fetch와 선택 상태를 chaseRunContext 모듈에 직접 연결해
// 거대한 러닝 런타임에 prop을 관통시키지 않는다. 시작 버튼은 기존 readyAction이 담당.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  getSelectedChaseArena,
  setSelectedChaseArena,
  subscribeChaseRunContext,
} from '@/features/runs/chase/chaseRunContext';
import { fetchChaseArenas } from '@/services';
import { getApiErrorMessage } from '@/services/apiError';
import type { ChaseArenaSummary } from '@/lib/api/types';
import { colors, fixedColors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';

export function ChaseSetupCard() {
  const [arenas, setArenas] = useState<ChaseArenaSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedArena = useSyncExternalStore(
    subscribeChaseRunContext,
    getSelectedChaseArena,
    getSelectedChaseArena,
  );
  // 이전 마운트/이전 새로고침의 늦은 응답이 최신 선택·목록을 덮어쓰지 못하게 하는 세대 가드.
  const loadEpochRef = useRef(0);

  const loadArenas = useCallback(async () => {
    const epoch = loadEpochRef.current + 1;
    loadEpochRef.current = epoch;
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetchChaseArenas();

      if (loadEpochRef.current !== epoch) {
        return; // 더 새로운 요청이 이미 나갔다 — 이 응답은 폐기.
      }

      setArenas(response.arenas);

      // 선택돼 있던 경기장의 점유 수를 최신값으로 갱신 (사라졌으면 선택 해제).
      const current = getSelectedChaseArena();

      if (current) {
        const refreshed = response.arenas.find((arena) => arena.id === current.id) ?? null;
        setSelectedChaseArena(refreshed);
      }
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

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>경기장 선택</Text>
        <Pressable onPress={() => void loadArenas()} hitSlop={8}>
          <Text style={styles.refreshLabel}>새로고침</Text>
        </Pressable>
      </View>
      <Text style={styles.rulesText}>
        경기장 안에서 다른 러너를 따라잡으면 +10P, 반대 방향에서 마주치면 서로 +5P.
        러닝이 끝나면 자동으로 정산돼요.
      </Text>

      {isLoading ? <ActivityIndicator color={colors.brandLight} /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {!isLoading && !error
        ? arenas.map((arena) => {
            const isSelected = selectedArena?.id === arena.id;
            const isFull = arena.currentCount >= arena.capacity;

            return (
              <Pressable
                key={arena.id}
                disabled={isFull && !isSelected}
                onPress={() => setSelectedChaseArena(isSelected ? null : arena)}
                style={[
                  styles.arenaRow,
                  isSelected ? styles.arenaRowSelected : null,
                  isFull && !isSelected ? styles.arenaRowFull : null,
                ]}
              >
                <View style={styles.arenaMeta}>
                  <Text style={styles.arenaName}>{arena.name}</Text>
                  <Text style={styles.arenaRegion}>{arena.regionLabel}</Text>
                </View>
                <Text style={[styles.arenaCount, isFull ? styles.arenaCountFull : null]}>
                  {isFull ? '정원 마감' : `${arena.currentCount}/${arena.capacity}`}
                </Text>
              </Pressable>
            );
          })
        : null}

      {!isLoading && !error && !selectedArena ? (
        <Text style={styles.helperText}>달릴 경기장을 선택하면 시작할 수 있어요.</Text>
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: colors.white,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
  refreshLabel: {
    color: colors.brandLighter,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  rulesText: {
    color: 'rgba(255, 255, 255, 0.62)',
    fontSize: fontSizes.sm,
    lineHeight: 19,
  },
  errorText: {
    color: colors.dangerAccent,
    fontSize: fontSizes.sm,
  },
  arenaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s12,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.13)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s10,
  },
  arenaRowSelected: {
    borderColor: fixedColors.brand,
    backgroundColor: 'rgba(109, 94, 247, 0.24)',
  },
  arenaRowFull: {
    opacity: 0.45,
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
  arenaCountFull: {
    color: 'rgba(255, 255, 255, 0.45)',
  },
  helperText: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: fontSizes.sm,
  },
});
