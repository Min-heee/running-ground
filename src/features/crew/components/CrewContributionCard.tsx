import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { colors, fixedColors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';
import { formatCrewContributionDiff, formatCrewKm, type CrewMyContribution } from '../crewModel';
import { crewListStyles } from './crewListStyles';

// 내 기여 카드 (오너 2026-09-19: "내 크루 들어가면 보는 맛이 있어야 — 내가 크루에 얼마나 기여했나,
// 얼마나 마이너스인가, 그래프나 원으로"). SVG가 없는 앱이라 원 대신 막대 둘:
//  ① 몫 막대 — 크루 멤버 기여를 한 줄에 쌓아, 내 조각만 보라(나머지는 같은 회색, 조각 사이 옅은 틈).
//  ② 나 vs 인당 평균 — 두 막대를 같은 눈금에 놓고 아래에 '+27.0km' / '−12.3km'.
// 막대는 홈 포인트 게이지와 같은 알약 모양·브랜드 보라.

function CompareRow({ label, km, ratio, mine }: { label: string; km: number; ratio: number; mine?: boolean }) {
  return (
    <View style={styles.compareRow}>
      <Text style={[styles.compareLabel, mine ? styles.compareLabelMine : null]}>{label}</Text>
      <View style={styles.compareTrack}>
        <View
          style={[
            styles.compareFill,
            mine ? styles.fillMine : styles.fillOther,
            { width: `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%` },
          ]}
        />
      </View>
      <Text style={[styles.compareKm, mine ? styles.compareKmMine : null]}>{formatCrewKm(km)}km</Text>
    </View>
  );
}

export const CrewContributionCard = memo(function CrewContributionCard({
  contribution,
}: {
  contribution: CrewMyContribution;
}) {
  const { myKm, sharePercent, segments, averageKm, diffKm } = contribution;
  const scaleKm = Math.max(myKm, averageKm ?? 0);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={crewListStyles.sectionTitle}>내 기여</Text>
        <Text style={styles.share}>크루 거리의 {sharePercent}%</Text>
      </View>
      <Text style={styles.bigKm}>{formatCrewKm(myKm)}km</Text>

      <View
        style={styles.shareBar}
        accessible
        accessibilityLabel={`크루 거리 중 내 몫 ${sharePercent}퍼센트`}
      >
        {segments.map((segment) => (
          <View
            key={segment.userId}
            style={[styles.segment, { flex: segment.ratio }, segment.isMe ? styles.fillMine : styles.fillOther]}
          />
        ))}
      </View>

      {averageKm !== null && diffKm !== null ? (
        <View style={styles.compare}>
          <CompareRow label="나" km={myKm} ratio={scaleKm > 0 ? myKm / scaleKm : 0} mine />
          <CompareRow label="인당 평균" km={averageKm} ratio={scaleKm > 0 ? averageKm / scaleKm : 0} />
          <Text style={[styles.diff, diffKm >= 0 ? styles.diffPlus : null]}>
            인당 평균보다 {formatCrewContributionDiff(diffKm)}
          </Text>
        </View>
      ) : null}
    </Card>
  );
});

const styles = StyleSheet.create({
  card: {
    gap: spacing.s12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s12,
  },
  share: {
    color: colors.brandStrong,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
  },
  bigKm: {
    color: colors.textPrimary,
    fontSize: fontSizes.hero,
    fontWeight: fontWeights.black,
    lineHeight: fontSizes.hero + 6,
    includeFontPadding: false,
  },
  // 몫 막대 — 조각 사이 2px 틈(트랙의 옅은 회색이 비친다), 아무도 안 뛰었으면 빈 트랙.
  shareBar: {
    flexDirection: 'row',
    gap: 2,
    height: 14,
    borderRadius: radii.pill,
    backgroundColor: colors.borderMuted,
    overflow: 'hidden',
  },
  segment: {
    height: '100%',
  },
  fillMine: {
    backgroundColor: fixedColors.brand,
  },
  fillOther: {
    backgroundColor: colors.textTertiary,
  },
  compare: {
    gap: spacing.s10,
    paddingTop: spacing.s12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s10,
  },
  compareLabel: {
    width: 56,
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  compareLabelMine: {
    color: colors.textPrimary,
  },
  compareTrack: {
    flex: 1,
    height: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.borderMuted,
    overflow: 'hidden',
  },
  compareFill: {
    height: '100%',
    borderRadius: radii.pill,
  },
  compareKm: {
    minWidth: 64,
    textAlign: 'right',
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  compareKmMine: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
  },
  // 평균보다 많이 뛰면 보라 '+', 적으면 회색 '−' (빨강은 기록 탭 승패 색이라 쓰지 않는다).
  diff: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
  },
  diffPlus: {
    color: colors.brandStrong,
  },
});
