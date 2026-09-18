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
// 기준 P는 지난 시즌 크루들의 인당 거리(첫 시즌은 30km)고, 이번 달에 누가 뛰어도 안 바뀐다.
// 단 지난 시즌이 확정되는 3일 0시 전까지는 늦게 올라온 지난달 기록만큼 조금 움직일 수 있어
// '시즌 내내 그대로'라고 단정하지 않는다 (적대 리뷰 2026-09-18 — 서버는 그 48시간에도 봉인될
// 값을 미리 계산해 쓰므로, 예전처럼 30 → 봉인값으로 크게 뛰지는 않는다).

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
          바뀌지 않고, 지난 시즌이 확정되는 3일 0시까지 늦게 올라온 지난달 기록만 조금 반영돼요.
          인원이 적은 크루일수록 기준 쪽으로 당겨져서, 한두 명이 많이 뛴 것만으로 1위가 되지 않아요.
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
  // 규칙 4줄 — 계정 카드와 같은 헤어라인 행 문법(점·아이콘 없이 글자만).
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
