import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { SectionTitle } from '@/components/SectionTitle';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { colors, fontSizes, fontWeights, spacing } from '@/theme/tokens';
import { CREW_GUIDE_INTRO, buildCrewGuideSections, type CrewGuideSection } from '../crewModel';
import { useCrewLeague } from '../hooks/useCrewLeague';

// 순위 기준 및 크루 설명 (오너 2026-09-18: 전체 순위 맨 아래 설명을 밖으로 빼 크루 탭 행에서 연다).
// 오너 2026-09-19: 한 장에 몰아 쓴 줄들을 순위·별·크루 세 묶음의 번호 목록으로 정리했다.
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

      {state.status === 'ready' ? (
        <>
          <Text style={styles.intro}>{CREW_GUIDE_INTRO}</Text>
          {buildCrewGuideSections(state.league.season).map((section) => (
            <CrewGuideCard key={section.title} section={section} />
          ))}
        </>
      ) : null}
    </Screen>
  );
}

// 묶음 한 장 — 제목 + 번호 목록 (오너 2026-09-19: '글씨 와다다다 → 1. 글씨 2. 글씨로 정리').
// 번호는 보라 굵은 숫자, 글은 번호 옆에 걸어 들여 쓴다. 순위 첫 줄만 아래에 회색 한 줄(공식·예시).
function CrewGuideCard({ section }: { section: CrewGuideSection }) {
  return (
    <Card style={styles.guideCard}>
      <SectionTitle>{section.title}</SectionTitle>
      <View style={styles.guideList}>
        {section.items.map((item, index) => (
          <View key={item.text} style={styles.guideRow}>
            <Text style={styles.guideNumber}>{index + 1}.</Text>
            <View style={styles.guideBody}>
              <Text style={styles.guideLine}>{item.text}</Text>
              {item.sub ? <Text style={styles.guideSub}>{item.sub}</Text> : null}
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  intro: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    lineHeight: 21,
  },
  guideCard: {
    gap: spacing.s12,
  },
  guideList: {
    gap: spacing.s12,
  },
  guideRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  guideNumber: {
    width: 20,
    color: colors.brandStrong,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
    lineHeight: 21,
  },
  guideBody: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
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
