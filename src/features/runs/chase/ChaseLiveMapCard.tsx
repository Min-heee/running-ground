// 경찰과 도둑런 라이브 지도 카드 — chase 러닝 중 트래킹 화면에 뜨는 실시간 참가자 지도.
// 10초마다 (1) 내 위치/방향/페이스를 하트비트로 올리고 (2) 경기장 라이브 데이터를 당긴다.
// 화면이 꺼지면 JS 타이머가 멈추므로 폴링도 멈춘다 — 지도는 보고 있을 때만 신선하면 된다.
// 주머니 속 러너의 마지막 위치는 서버가 신선도(ageSeconds)와 함께 주고, 낡은 마커는 흐리게.

import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { getActiveChaseArena } from '@/features/runs/chase/chaseRunContext';
import { headingDegreesBetween } from '@/features/runs/chase/chaseLiveGeo';
import { ChaseLiveMapView } from '@/features/runs/chase/ChaseLiveMapView';
import { getBackgroundRunTrackingSnapshot } from '@/features/runs/tracking/background';
import { fetchChaseLive, updateChasePosition } from '@/services';
import type { ChaseLiveResponse } from '@/lib/api/types';
import { colors, fixedColors, fontSizes, fontWeights, spacing } from '@/theme/tokens';

const CHASE_LIVE_TICK_MS = 10_000;
const HEADING_LOOKBACK_MS = 15_000;

// 트래킹 스냅샷 꼬리에서 내 위치 하트비트 재료를 뽑는다.
function buildOwnPosition() {
  const snapshot = getBackgroundRunTrackingSnapshot({ cloneRoute: false });
  const route = snapshot.route;
  const last = route[route.length - 1];

  if (!last) {
    return null;
  }

  const lastMs = Date.parse(last.timestamp);
  let anchor = last;

  for (let index = route.length - 2; index >= 0; index -= 1) {
    const point = route[index];

    if (lastMs - Date.parse(point.timestamp) >= HEADING_LOOKBACK_MS) {
      anchor = point;
      break;
    }

    anchor = point;
  }

  return {
    latitude: last.latitude,
    longitude: last.longitude,
    headingDeg: headingDegreesBetween(anchor, last),
    paceLabel: snapshot.currentPace !== '--:--/km' ? snapshot.currentPace : null,
  };
}

export function ChaseLiveMapCard() {
  // 러닝 시작 시점에 잠근 경기장 — 러닝 동안 불변이라 첫 렌더 값으로 고정.
  const arenaRef = useRef(getActiveChaseArena());
  const arena = arenaRef.current;
  const [live, setLive] = useState<ChaseLiveResponse | null>(null);
  const [lastFetchedAtMs, setLastFetchedAtMs] = useState<number | null>(null);
  // 실패 자체는 표시하지 않지만, 실패 틱마다 리렌더를 일으켜 isStale(시간 경과) 재평가를
  // 보장한다 — 이게 없으면 통신이 끊겨도 카드가 리렌더될 계기가 없어 '끊김' 표시가 안 뜬다.
  const [, setFailedTickCount] = useState(0);
  const tickInFlightRef = useRef(false);

  useEffect(() => {
    if (!arena) {
      return;
    }

    let cancelled = false;

    const tick = async () => {
      // 저장 흐름이 컨텍스트를 비우면 즉시 침묵 — 업로드 정산이 반납한 슬롯을 늦은
      // 하트비트가 부활시키지 않게 한다 (서버의 15분 단명 슬롯은 마지막 안전망).
      if (tickInFlightRef.current || !getActiveChaseArena()) {
        return;
      }

      tickInFlightRef.current = true;

      try {
        const own = buildOwnPosition();

        if (own) {
          await updateChasePosition({ arenaId: arena.arenaId, ...own });
        }

        const liveData = await fetchChaseLive(arena.arenaId);

        if (!cancelled) {
          setLive(liveData);
          setLastFetchedAtMs(Date.now());
        }
      } catch {
        // 일시 실패는 다음 틱이 만회 — 러닝을 방해하는 배너는 띄우지 않는다.
        if (!cancelled) {
          setFailedTickCount((count) => count + 1);
        }
      } finally {
        tickInFlightRef.current = false;
      }
    };

    void tick();
    const interval = setInterval(() => {
      void tick();
    }, CHASE_LIVE_TICK_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [arena]);

  if (!arena) {
    return null;
  }

  const participants = live?.participants ?? [];
  const otherCount = participants.filter((entry) => !entry.isSelf).length;
  // 마지막 성공 후 30초 넘게 못 받으면 "끊김"을 정직하게 표시 — 몇 분 전 마커가
  // 방금 것처럼 보이지 않게.
  const isStale = lastFetchedAtMs !== null && Date.now() - lastFetchedAtMs > 30_000;

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{arena.arenaName}</Text>
        <Text style={[styles.countLabel, isStale ? styles.countLabelStale : null]}>
          {live
            ? isStale
              ? '연결 대기 중…'
              : `러너 ${participants.length}명`
            : '불러오는 중…'}
        </Text>
      </View>
      <View style={styles.mapWrap}>
        <ChaseLiveMapView
          latitude={arena.latitude}
          longitude={arena.longitude}
          radiusM={arena.radiusM}
          participants={participants}
        />
      </View>
      <Text style={styles.hintText}>
        {otherCount > 0
          ? '확대하면 러너들의 방향과 페이스가 보여요. 스침은 러닝이 끝나면 자동 정산돼요.'
          : '아직 경기장에 다른 러너가 없어요. 스침은 러닝이 끝나면 자동 정산돼요.'}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.s10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s12,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  countLabel: {
    color: fixedColors.brand,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  countLabelStale: {
    color: colors.textTertiary,
  },
  mapWrap: {
    height: 260,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.borderMuted,
  },
  hintText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 18,
  },
});
