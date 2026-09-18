import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';
import {
  buildCrewScoreExampleLine,
  buildCrewScoreFormulaLine,
  buildCrewScoreRuleLines,
} from '../crewModel';

// 점수 설명 (심사 must-fix: 큰 숫자에 단위 + 고정된 기준 P를 실제 값으로 + 예시 하나).
// 기준 P는 지난 시즌 크루들의 인당 거리(첫 시즌은 30km)고, 이번 달에 누가 뛰어도 안 바뀐다
// (지난 시즌 확정 전 1시간 동안 늦게 올라온 지난달 기록만큼만 움직일 수 있다 — 서버는 그 사이에도
// 봉인될 값을 미리 계산해 쓴다). 오너 2026-09-18부터 크루 탭 '순위 기준' 페이지에만 뜬다 — 전체
// 순위 맨 아래에서 밖으로 뺐고, '앱 기록만'·'하루 45km' 줄은 규칙째 없앴다.

export const CrewScoreExplainCard = memo(function CrewScoreExplainCard({
  priorKm,
  isPreseason,
}: {
  priorKm: number;
  isPreseason: boolean;
}) {
  return (
    <Card style={styles.card}>
      <SectionTitle>보정 인당은 이렇게 매겨요</SectionTitle>
      <View style={styles.block}>
        <Text style={styles.formula}>{buildCrewScoreFormulaLine(priorKm)}</Text>
        <Text style={styles.body}>{buildCrewScoreExampleLine(priorKm)}</Text>
        <Text style={styles.body}>
          기준 거리는 지난 시즌 크루들의 인당 거리예요(첫 시즌은 30km). 이번 달에 누가 얼마를 뛰든
          바뀌지 않아요. 인원이 적은 크루일수록 기준 쪽으로 당겨져서, 한두 명이 많이 뛴 것만으로
          1위가 되지 않아요.
        </Text>
      </View>
      <View>
        {buildCrewScoreRuleLines(isPreseason).map((line, index) => (
          <Text key={line} style={[styles.ruleLine, index === 0 ? null : styles.ruleLineDivided]}>
            {line}
          </Text>
        ))}
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  card: {
    gap: spacing.s12,
  },
  block: {
    gap: spacing.lg,
  },
  formula: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
    lineHeight: 20,
  },
  body: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    lineHeight: 19,
  },
  // 규칙 줄 — 계정 카드와 같은 헤어라인 행 문법(점·아이콘 없이 글자만).
  ruleLine: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    paddingVertical: spacing.s10,
  },
  ruleLineDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
  },
});
