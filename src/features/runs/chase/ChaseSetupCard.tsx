// 경찰과 도둑 모드 셋업 카드 — 흐름(오너 2026-07-28): 경기장 목록에서 하나를 누르면
// 그 자리에서 '라이브 미리보기 지도'로 전환되고(지금 달리는 러너들이 익명 점으로 실시간
// 표시, 10초 폴링), 지도 아래 '러닝 시작' 버튼이 입장→GPS 시작을 태운다. 큰 readyAction
// 버튼은 chase에선 제거됨.
//
// 프라이버시: 시작 전 미리보기는 익명 overview(점+방향+인원 수만, 신원/페이스 없음).
// 이름 붙은 상세 지도는 경기장 안에서 달리는 중일 때만 (서버 게이트).

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  getSelectedChaseArena,
  setSelectedChaseArena,
  subscribeChaseRunContext,
} from '@/features/runs/chase/chaseRunContext';
import { ChaseLiveMapView } from '@/features/runs/chase/ChaseLiveMapView';
import { fetchChaseArenas, fetchChaseOverview } from '@/services';
import { getApiErrorMessage } from '@/services/apiError';
import type { ChaseArenaSummary, ChaseLiveParticipant, ChaseOverviewResponse } from '@/lib/api/types';
import { colors, fixedColors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';

const OVERVIEW_TICK_MS = 10_000;

// 익명 러너 점을 지도 뷰의 참가자 형태로 변환 — 이름/신원 없이 점+방향만 그린다.
function toAnonymousParticipants(overview: ChaseOverviewResponse | null): ChaseLiveParticipant[] {
  if (!overview) {
    return [];
  }

  return overview.runners.map((runner, index) => ({
    // 좌표 기반 키 — 인덱스 키는 러너가 빠질 때 다른 점이 그 키를 물려받아 지도가
    // 가짜 이동 경로를 그린다. 좌표 키는 매 폴마다 마커를 새로 그릴 뿐(슬라이드 없음).
    userId: `anon-${runner.latitude.toFixed(5)}:${runner.longitude.toFixed(5)}:${index}`,
    name: '',
    latitude: runner.latitude,
    longitude: runner.longitude,
    headingDeg: runner.headingDeg,
    paceLabel: null,
    ageSeconds: runner.ageSeconds,
    isSelf: false,
  }));
}

// 경기장 목록 (미선택 상태) — 하나를 누르면 미리보기 지도로 전환.
function ArenaListSection() {
  const [arenas, setArenas] = useState<ChaseArenaSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadEpochRef = useRef(0);

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

  return (
    <>
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
              onPress={() => setSelectedChaseArena(arena)}
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
        <Text style={styles.helperText}>경기장을 누르면 라이브 지도가 열려요.</Text>
      ) : null}
    </>
  );
}

// 선택된 경기장의 라이브 미리보기 — 익명 점 실시간(10초) + 지도 아래 러닝 시작 버튼.
function ArenaPreviewSection({
  arena,
  onStartRun,
}: {
  arena: ChaseArenaSummary;
  onStartRun?: () => void;
}) {
  const [overview, setOverview] = useState<ChaseOverviewResponse | null>(null);
  const tickInFlightRef = useRef(false);

  useEffect(() => {
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
  }, [arena.id]);

  const runningCount = overview?.runners.length ?? 0;
  const isFull = overview !== null && overview.currentCount >= overview.capacity;

  return (
    <>
      <View style={styles.previewHeaderRow}>
        <Pressable onPress={() => setSelectedChaseArena(null)} hitSlop={8}>
          <Text style={styles.backLabel}>‹ 경기장 목록</Text>
        </Pressable>
        <Text style={styles.previewCount}>
          {overview ? `${overview.currentCount}/${overview.capacity}` : '…'}
        </Text>
      </View>
      <View style={styles.previewTitleRow}>
        <Text style={styles.previewTitle}>{arena.name}</Text>
        <Text style={styles.previewSubtitle}>
          {runningCount > 0 ? `지금 ${runningCount}명이 달리는 중` : '지금은 조용해요'}
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
      {/* 지도 아래 시작 버튼 — 기존 chase 시작 플로우(슬롯 확보 → GPS 시작)를 그대로 태운다.
          정원 판정의 최종 권위는 서버(join 400)지만, 가득 찼을 땐 미리 알려준다. */}
      <Pressable
        onPress={onStartRun}
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
    </>
  );
}

export function ChaseSetupCard({ onStartRun }: { onStartRun?: () => void }) {
  const selectedArena = useSyncExternalStore(
    subscribeChaseRunContext,
    getSelectedChaseArena,
    getSelectedChaseArena,
  );

  return (
    <View style={styles.card}>
      {selectedArena ? (
        <ArenaPreviewSection arena={selectedArena} onStartRun={onStartRun} />
      ) : (
        <ArenaListSection />
      )}
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
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backLabel: {
    color: colors.brandLighter,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  previewCount: {
    color: colors.brandLighter,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  previewTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.s12,
  },
  previewTitle: {
    color: colors.white,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  previewSubtitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: fontSizes.sm,
  },
  mapWrap: {
    height: 300,
    borderRadius: radii.lg,
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
    color: 'rgba(255, 255, 255, 0.62)',
    fontSize: fontSizes.sm,
    lineHeight: 19,
  },
});
