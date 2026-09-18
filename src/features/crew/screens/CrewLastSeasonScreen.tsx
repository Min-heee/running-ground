import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import type { CrewHomeResponse } from '@/lib/api/types/crew';
import { colors, fontSizes, fontWeights } from '@/theme/tokens';
import { CrewStandingListRow } from '../components/CrewRows';
import { crewListStyles } from '../components/crewListStyles';
import { buildCrewLastSeasonHeadline, isCrewFirstSeason, shiftCrewSeasonKey } from '../crewModel';
import { useCrewHome } from '../hooks/useCrewHome';
import { useCrewLeague, type CrewLeagueState } from '../hooks/useCrewLeague';

// 지난 시즌 (오너 2026-09-18): 크루 탭의 '이번 달 | 지난 시즌' 두 갈래를 '이번 시즌' 하나로 줄이고,
// 순위표 오른쪽 아래 '지난 시즌 ›'에서 여기로 넘어온다. 우승 한 줄 + 봉인 스냅샷 상위 10개 —
// 봉인된 시즌은 서버가 원장 스냅샷만 주므로 기록이 나중에 바뀌어도 숫자가 안 바뀐다. 봉인 전
// 1시간은 '집계 중'으로 라이브 값을 보인다.

// 원장이 상위 10개까지만 담는다.
const LAST_SEASON_ROW_LIMIT = 10;

export default function CrewLastSeasonScreen() {
  const { home, error, loadHome } = useCrewHome();
  const previousSeasonKey = home ? shiftCrewSeasonKey(home.season.seasonKey, -1) : null;
  // 홈의 lastSeason은 지난 시즌이 봉인되면 null → 그 시즌 키로 바뀐다. 이 값이 바뀌면 들고 있던
  // '집계 중' 순위표를 봉인 스냅샷으로 다시 부른다 (적대 리뷰 2026-09-18).
  const lastSeason = useCrewLeague(previousSeasonKey, home !== null, home?.lastSeason?.seasonKey ?? null);

  useFocusEffect(useCallback(() => {
    void loadHome();
  }, [loadHome]));

  return (
    <Screen>
      <AuthHeader showBack backHref="/(tabs)/crew" title="지난 시즌" />

      {!home && !error ? <ActivityIndicator size="large" color={colors.brand} /> : null}

      {error && !home ? (
        <Card>
          <Text style={crewListStyles.errorText}>{error}</Text>
          <PrimaryButton label="다시 불러오기" onPress={() => { void loadHome(); }} />
        </Card>
      ) : null}

      {home ? <LastSeasonBody home={home} state={lastSeason.state} onRetry={lastSeason.reload} /> : null}
    </Screen>
  );
}

function LastSeasonBody({
  home,
  state,
  onRetry,
}: {
  home: CrewHomeResponse;
  state: CrewLeagueState;
  onRetry: () => void;
}) {
  if (state.status === 'idle' || state.status === 'loading') {
    return <ActivityIndicator size="large" color={colors.brand} />;
  }

  if (state.status === 'error') {
    return (
      <Card>
        <Text style={crewListStyles.errorText}>{state.message}</Text>
        <PrimaryButton label="다시 불러오기" onPress={onRetry} />
      </Card>
    );
  }

  const league = state.status === 'ready' ? state.league : null;
  const rows = (league?.ranked ?? []).slice(0, LAST_SEASON_ROW_LIMIT);

  if (!league || rows.length === 0) {
    return (
      <Text style={styles.empty}>
        {isCrewFirstSeason(home.season)
          ? `${home.season.label}이 첫 시즌이에요. 지난 시즌 결과는 다음 달부터 여기서 볼 수 있어요.`
          : '지난 시즌엔 순위에 오른 크루가 없었어요.'}
      </Text>
    );
  }

  // 우승은 순위만으로 정해지지 않는다(뛴 멤버 3명·시즌 끝까지 살아 있는 크루) — 서버 원장의
  // 챔피언 목록이 이 시즌 것일 때만 쓴다.
  const champions = home.lastSeason?.seasonKey === league.season.seasonKey ? home.lastSeason.champions : [];

  return (
    <View style={crewListStyles.section}>
      <Text style={styles.headline}>
        {buildCrewLastSeasonHeadline({ season: league.season, sealed: league.sealed, champions })}
      </Text>
      <Card style={crewListStyles.rowsCard}>
        {rows.map((row, index) => (
          <CrewStandingListRow key={row.crewId} row={row} isFirst={index === 0} />
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  headline: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    lineHeight: 24,
  },
  empty: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    lineHeight: 20,
  },
});
