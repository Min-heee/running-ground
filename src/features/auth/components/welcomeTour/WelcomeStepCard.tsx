import { memo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { tourCardStyles } from './tourCardStyles';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

const appIcon = require('../../../../../assets/branding/icon.png');

// 첫인상 카드: 이모지 배지 대신 실제 브랜드 아이콘 + "무엇이 다른 앱인지" 3줄. 여기서 팔고,
// 다음 단계(권한)에서 걷는다.
const HIGHLIGHTS: { title: string; description: string }[] = [
  { title: '같은 출발, 같은 거리', description: '비슷한 페이스의 러너와 실시간으로 겨뤄요' },
  { title: '이기면 LP, 오르는 티어', description: '승리가 랭크로 쌓이는 진짜 승부' },
  { title: '화면 꺼도 이어지는 측정', description: 'GPS가 경로·거리·페이스를 끝까지 기록해요' },
];

export const WelcomeStepCard = memo(function WelcomeStepCard() {
  return (
    <View style={tourCardStyles.heroCard}>
      <View style={styles.brandRow}>
        <Image source={appIcon} style={styles.brandIcon} />
      </View>
      <Text style={tourCardStyles.kicker}>WELCOME TO RUNNINGGROUND</Text>
      <Text style={tourCardStyles.title}>달리기, 이제{'\n'}진짜 승부</Text>
      <View style={styles.highlightList}>
        {HIGHLIGHTS.map((item, index) => (
          <View key={item.title} style={styles.highlightRow}>
            <View style={styles.highlightBadge}>
              <Text style={styles.highlightBadgeText}>{index + 1}</Text>
            </View>
            <View style={styles.highlightCopy}>
              <Text style={styles.highlightTitle}>{item.title}</Text>
              <Text style={styles.highlightDescription}>{item.description}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  brandRow: {
    marginBottom: spacing.s10,
  },
  brandIcon: {
    borderRadius: radii.lg,
    height: 72,
    width: 72,
  },
  highlightList: {
    gap: spacing.s10,
    marginTop: spacing.s12,
  },
  highlightRow: {
    alignItems: 'center',
    backgroundColor: colors.translucentWhite18,
    borderRadius: radii.lg,
    flexDirection: 'row',
    gap: spacing.s12,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s12,
  },
  highlightBadge: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  highlightBadgeText: {
    color: colors.white,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.black,
  },
  highlightCopy: {
    flex: 1,
    gap: 1,
  },
  highlightTitle: {
    color: colors.white,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.extraBold,
  },
  highlightDescription: {
    color: colors.lavenderSoft,
    fontSize: fontSizes.xs,
    lineHeight: 17,
  },
});
