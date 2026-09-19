import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { SectionTitle } from '@/components/SectionTitle';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import type { CrewSeasonInfo } from '@/lib/api/types/crew';
import { colors, fontSizes, fontWeights, spacing } from '@/theme/tokens';
import { CrewScoreExplainCard } from '../components/CrewScoreExplainCard';
import { buildCrewGuideLines } from '../crewModel';
import { useCrewLeague } from '../hooks/useCrewLeague';

// 순위 기준 및 크루 설명 (오너 2026-09-18: 전체 순위 맨 아래 설명을 밖으로 빼 크루 탭 행에서 연다.
// 같은 날 '크루 설명'도 여기에 붙였다 — 크루 탭엔 내 크루 카드 밑 한 줄만 남긴다).
// 기준 거리 P와 프리시즌 여부는 이번 시즌 순위 응답에서 읽는다 — 설명의 숫자가 실제 순위 계산과
// 같은 값이어야 해서 화면에 따로 적어 두지 않는다.
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

      {state.status === 'ready' ? (
        <>
          <CrewScoreExplainCard
            priorKm={state.league.season.priorKm}
            isPreseason={state.league.season.isPreseason}
          />
          <CrewGuideCard season={state.league.season} />
        </>
      ) : null}
    </Screen>
  );
}

// 크루 설명 — 점수 설명 카드와 같은 헤어라인 줄 문법(점·아이콘 없이 글자만).
function CrewGuideCard({ season }: { season: CrewSeasonInfo }) {
  return (
    <Card style={styles.guideCard}>
      <SectionTitle>크루 설명</SectionTitle>
      <View>
        {buildCrewGuideLines(season).map((line, index) => (
          <Text key={line} style={[styles.guideLine, index === 0 ? null : styles.guideLineDivided]}>
            {line}
          </Text>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  guideCard: {
    gap: spacing.s12,
  },
  guideLine: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    lineHeight: 21,
    paddingVertical: spacing.s10,
  },
  guideLineDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    lineHeight: 20,
  },
});
