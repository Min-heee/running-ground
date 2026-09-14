import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { SegmentSwitch } from '@/components/ui/SegmentSwitch';
import { TabHeader } from '@/components/ui/TabHeader';
import { ActivityMonthSection } from '@/features/profile/components/ActivityMonthSection';
import { buildActivityMonthGroups } from '@/features/profile/utils/activityMonthGroups';
import { useMyActivity } from '@/features/profile/hooks/useMyActivity';
import { getRunKind } from '@/features/runs/utils/runKind';
import type { RunKind } from '@/features/runs/utils/runKind';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';
import { useTabWarmupTrace } from '@/utils/useTabWarmupTrace';

// 기록 탭의 화면 (오너 2026-09-11). 예전엔 마이 탭에서 밀어 올리는 /my-activity 스택
// 화면이었고, 지금은 탭바에서 바로 열리는 탭 루트다 — 그래서 뒤로가기 헤더도,
// '마이페이지로 돌아가기' 버튼도 없다(탭 루트에는 돌아갈 곳이 없다). 옛 경로는
// app/my-activity.tsx의 리다이렉트가 이 탭으로 보낸다.
//
// 화면 개편 (오너 2026-09-14, 시안 C '월 타임라인'): 요약 카드 2장 + 연·월 드롭다운 +
// 종류/모드 세그먼트 2줄 + 행마다 붙던 '보기'를 전부 걷어냈다. 내용에 닿기까지 크롬을
// 네 겹 지나야 했고, 행에서 제일 큰 글씨가 사람이 안 읽는 ISO 날짜였다.
// 지금은 세그먼트 하나 + 달 머리글 + 흰 블록 한 겹으로 한 줄기로 이어진다.

type ActivityKindFilter = 'all' | RunKind;

// 순서·단어는 러닝 탭 세그먼트(혼자/매칭/파티런)를 따라간다 — 필터 라벨과 행의 종류
// 라벨이 같은 단어로 맞물려야 필터가 읽힌다.
const KIND_FILTER_ITEMS: readonly { id: ActivityKindFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'solo', label: '혼자' },
  { id: 'match', label: '매칭' },
  { id: 'party', label: '파티런' },
];

export default function MyActivityScreen() {
  useTabWarmupTrace('records');
  const { activity, activityRuns, error, loading } = useMyActivity();
  const [kindFilter, setKindFilter] = useState<ActivityKindFilter>('all');
  const handleSelectKind = useCallback((id: string) => setKindFilter(id as ActivityKindFilter), []);

  // 마운트 때 얼리면(useState) 탭 루트라 계속 마운트된 채 자정·월말을 넘기며 '이번 달'이
  // 지난 달에 머문다. useMyActivity가 포커스마다 재조회하므로 새 페이로드에 맞춰 갱신한다.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- activity가 갱신될 때만 '지금'을 다시 읽는 게 목적이다
  const nowMs = useMemo(() => Date.now(), [activity]);
  const visibleRuns = useMemo(() => (
    kindFilter === 'all'
      ? activityRuns
      : activityRuns.filter((run) => getRunKind(run) === kindFilter)
  ), [activityRuns, kindFilter]);
  // 서버가 이미 최신순(compareRunsLatestFirst)으로 내려준다 — 다시 정렬하지 않는다.
  const groups = useMemo(() => buildActivityMonthGroups(visibleRuns, nowMs), [visibleRuns, nowMs]);

  const activeKindLabel = KIND_FILTER_ITEMS.find((item) => item.id === kindFilter)?.label ?? '전체';
  const hint = activityRuns.length === 0
    ? '러닝을 마치면 여기에 차곡차곡 쌓여요'
    : (visibleRuns.length === 0 ? `${activeKindLabel} 기록이 아직 없어요` : null);

  return (
    <Screen>
      <TabHeader title="기록" />

      <SegmentSwitch
        items={KIND_FILTER_ITEMS}
        activeId={kindFilter}
        onSelect={handleSelectKind}
      />

      {loading && !activity ? <ActivityIndicator size="large" color={colors.brand} /> : null}

      {/* 이미 받아둔 기록이 있으면 재조회 실패는 조용히 삼킨다 — 에러 줄이 끼어들면 레이아웃이 튄다. */}
      {error && !activity ? (
        <View style={styles.errorBlock}>
          <Text style={styles.errorTitle}>기록을 불러오지 못했어요</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {activity ? (
        <View style={styles.list}>
          {groups.map((group) => (
            <ActivityMonthSection key={group.key} group={group} />
          ))}
        </View>
      ) : null}

      {activity && hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.s20,
  },
  hint: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    lineHeight: 20,
  },
  errorBlock: {
    gap: spacing.sm,
  },
  errorTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  errorText: {
    color: colors.danger,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    lineHeight: 20,
  },
});
