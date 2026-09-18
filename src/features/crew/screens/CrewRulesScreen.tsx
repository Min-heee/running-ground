import { ActivityIndicator, StyleSheet, Text } from 'react-native';

import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { colors, fontSizes, fontWeights } from '@/theme/tokens';
import { CrewScoreExplainCard } from '../components/CrewScoreExplainCard';
import { useCrewLeague } from '../hooks/useCrewLeague';

// 순위 기준 (오너 2026-09-18: 전체 순위 맨 아래 설명을 밖으로 빼 크루 탭 '순위 기준 ›'에서 연다).
// 기준 거리 P와 프리시즌 여부는 이번 시즌 순위 응답에서 읽는다 — 설명의 숫자가 실제 순위 계산과
// 같은 값이어야 해서 화면에 따로 적어 두지 않는다.
export default function CrewRulesScreen() {
  const current = useCrewLeague(undefined, true);
  const { state } = current;

  return (
    <Screen>
      <AuthHeader showBack backHref="/(tabs)/crew" title="순위 기준" />

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
        <CrewScoreExplainCard
          priorKm={state.league.season.priorKm}
          isPreseason={state.league.season.isPreseason}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  errorText: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    lineHeight: 20,
  },
});
