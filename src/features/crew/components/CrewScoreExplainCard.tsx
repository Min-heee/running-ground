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

// 순위 설명 — 인당 km = 크루 총거리 ÷ 시즌 멤버 수 (오너 2026-09-19: '보정 인당은 이렇게 매겨요'가
// 무슨 소리인지 모르겠다 → 공식을 단순 인당으로 바꾸고 설명도 한 줄로). 크루 탭 '순위 기준 및 크루
// 설명' 페이지에만 뜬다. '앱 기록만'·'하루 45km' 줄은 오너 2026-09-18에 규칙째 없앴다.

export const CrewScoreExplainCard = memo(function CrewScoreExplainCard({
  isPreseason,
}: {
  isPreseason: boolean;
}) {
  return (
    <Card style={styles.card}>
      <SectionTitle>순위는 이렇게 매겨요</SectionTitle>
      <View style={styles.block}>
        <Text style={styles.formula}>{buildCrewScoreFormulaLine()}</Text>
        <Text style={styles.body}>{buildCrewScoreExampleLine()}</Text>
        <Text style={styles.body}>인당 km가 높은 크루가 1위예요.</Text>
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
