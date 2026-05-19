import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { useTabWarmupTrace } from '@/utils/useTabWarmupTrace';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

export default function RaceScreen() {
  useTabWarmupTrace('race');
  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text style={styles.screenTitle}>레이스</Text>
      </View>

      <Card>
        <Text style={styles.statusEyebrow}>COMING SOON</Text>
        <Text style={styles.statusTitle}>준비중</Text>
        <Text style={styles.statusDescription}>
          레이스는 온라인 마라톤을 준비중입니다. 온라인 마라톤은 장소 제약 없이 각자 뛰고 싶은
          장소에서 달린 뒤 기록으로 함께 경쟁하는 방식으로 제공될 예정입니다.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    marginBottom: spacing.s12,
  },
  screenTitle: {
    color: colors.nearBlack,
    fontSize: fontSizes.hero,
    fontWeight: fontWeights.extraBold,
  },
  statusEyebrow: {
    color: colors.brandAccent,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
    letterSpacing: 1.4,
    marginBottom: spacing.s10,
  },
  statusTitle: {
    color: colors.nearBlack,
    fontSize: fontSizes.pageTitle,
    fontWeight: fontWeights.extraBold,
    marginBottom: spacing.s12,
  },
  statusDescription: {
    color: colors.slateLabel,
    fontSize: 15,
    fontWeight: fontWeights.semibold,
    lineHeight: 24,
  },
});
