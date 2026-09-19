import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { SectionTitle } from '@/components/SectionTitle';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import type { CrewSeasonInfo } from '@/lib/api/types/crew';
import { colors, fontSizes, fontWeights, spacing } from '@/theme/tokens';
import { buildCrewGuideItems } from '../crewModel';
import { useCrewLeague } from '../hooks/useCrewLeague';

// 순위 기준 및 크루 설명 (오너 2026-09-18: 전체 순위 맨 아래 설명을 밖으로 빼 크루 탭 행에서 연다).
// 오너 2026-09-19: 순위 설명 카드와 크루 설명 카드를 '크루 설명' 한 장으로 합쳤다.
// 프리시즌 여부·별이 붙는 첫 시즌은 이번 시즌 순위 응답에서 읽는다 — 설명이 실제 규칙과 어긋나지 않게.
export default function CrewRulesScreen() {
  const current = useCrewLeague(undefined, true);
  const { state } = current;

  return (
    <Screen>
      <AuthHeader showBack backHref="/(tabs)/crew" title="순위 기준 및 크루 설명" />

      {state.status === 'idle' || state.status === 'loading' ? (
        <ActivityIndicator size="large" color={colors.brand} />
      ) : null}

      {state.status === 'error' ? (
        <Card>
          <Text style={styles.errorText}>{state.message}</Text>
          <PrimaryButton label="다시 불러오기" onPress={current.reload} />
        </Card>
      ) : null}

      {state.status === 'missing' ? (
        <Text style={styles.errorText}>이번 시즌 정보를 찾지 못했어요.</Text>
      ) : null}

      {state.status === 'ready' ? <CrewGuideCard season={state.league.season} /> : null}
    </Screen>
  );
}

// 크루 설명 한 장 — 헤어라인 줄 문법(점·아이콘 없이 글자만). 순위 줄만 아래에 회색 한 줄(공식·예시).
function CrewGuideCard({ season }: { season: CrewSeasonInfo }) {
  return (
    <Card style={styles.guideCard}>
      <SectionTitle>크루 설명</SectionTitle>
      <View>
        {buildCrewGuideItems(season).map((item, index) => (
          <View key={item.text} style={[styles.guideRow, index === 0 ? null : styles.guideRowDivided]}>
            <Text style={styles.guideLine}>{item.text}</Text>
            {item.sub ? <Text style={styles.guideSub}>{item.sub}</Text> : null}
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  guideCard: {
    gap: spacing.s12,
  },
  guideRow: {
    gap: spacing.xxs,
    paddingVertical: spacing.s10,
  },
  guideRowDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
  },
  guideLine: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    lineHeight: 21,
  },
  guideSub: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    lineHeight: 19,
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    lineHeight: 20,
  },
});
