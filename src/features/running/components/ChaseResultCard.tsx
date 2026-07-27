import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import type { MyRunRecord } from '@/domain';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

type ChaseSummary = NonNullable<MyRunRecord['chase']>;

function formatEventTime(atIso: string) {
  const atMs = Date.parse(atIso);

  if (!Number.isFinite(atMs)) {
    return '';
  }

  const at = new Date(atMs);
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

function describeEvent(event: ChaseSummary['events'][number]) {
  if (event.role === 'catcher') {
    return `${event.otherName}님을 따라잡았어요`;
  }

  if (event.role === 'caught') {
    return `${event.otherName}님에게 따라잡혔어요`;
  }

  return `${event.otherName}님과 마주쳤어요`;
}

// 경찰과 도둑런 정산 카드 — run.chase가 있는 러닝 상세에만 렌더.
// 상대가 아직 달리는 중이면 그쪽 업로드 때 소급 정산되므로, 이 카드는 다시 볼 때마다
// 최신 정산 누적을 보여준다 (서버가 run.chase에 박제).
export function ChaseResultCard({ chase }: { chase: ChaseSummary }) {
  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>경찰과 도둑</Text>
        {chase.arenaName ? <Text style={styles.arenaName}>{chase.arenaName}</Text> : null}
      </View>

      {chase.events.length === 0 ? (
        <Text style={styles.emptyText}>
          이번 러닝에서 정산된 스침이 아직 없어요. 함께 달리던 러너가 러닝을 끝내면 자동으로
          정산돼요.
        </Text>
      ) : (
        chase.events.map((event, index) => (
          <View key={`${event.atIso}-${event.otherUserId}-${index}`} style={styles.eventRow}>
            <View style={styles.eventMeta}>
              <Text style={styles.eventText}>{describeEvent(event)}</Text>
              <Text style={styles.eventTime}>{formatEventTime(event.atIso)}</Text>
            </View>
            <Text style={[styles.eventPoints, event.points > 0 ? styles.eventPointsEarned : null]}>
              {event.points > 0 ? `+${event.points}P` : '—'}
            </Text>
          </View>
        ))
      )}

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>스침 보너스</Text>
        <Text style={styles.totalValue}>+{chase.bonusPoints}P</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.s10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s12,
  },
  sectionTitle: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    color: colors.textPrimary,
  },
  arenaName: {
    color: colors.brand,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.sm,
  },
  emptyText: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  eventRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s12,
  },
  eventMeta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s10,
  },
  eventText: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
    flexShrink: 1,
  },
  eventTime: {
    color: colors.textTertiary,
    fontSize: fontSizes.sm,
  },
  eventPoints: {
    color: colors.textTertiary,
    fontWeight: fontWeights.extraBold,
  },
  eventPointsEarned: {
    color: colors.blueStrong,
  },
  totalRow: {
    marginTop: spacing.xs,
    paddingTop: spacing.s12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
  },
  totalValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.black,
  },
});
