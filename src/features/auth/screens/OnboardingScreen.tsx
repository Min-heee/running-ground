import { Image, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { colors, radii, spacing, fontSizes, fontWeights } from '@/theme/tokens';

const appIcon = require('../../../../assets/branding/icon.png');

type Feature = {
  emoji: string;
  title: string;
  description: string;
};

const FEATURES: Feature[] = [
  { emoji: '⚡', title: '실시간 대결', description: '비슷한 페이스끼리 1:1 실시간 경쟁' },
  { emoji: '🏆', title: '지역 랭킹', description: '내 동네에서 내가 몇 등인지' },
  { emoji: '👥', title: '파티런', description: '친구 초대해서 그룹으로 같이 달리기' },
  { emoji: '🔗', title: '기록 연동', description: 'Strava·애플 건강 기록 그대로 가져오기' },
];

export default function OnboardingScreen() {
  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.hero}>
            <Image source={appIcon} style={styles.icon} resizeMode="cover" />
            <Text style={styles.title}>러닝그라운드</Text>
            <Text style={styles.subtitle}>실시간 대결하고 랭킹을 확인할 수 있는 러닝앱</Text>
          </View>

          <View style={styles.features}>
            {FEATURES.map((feature) => (
              <View key={feature.title} style={styles.featureRow}>
                <View style={styles.featureIcon}>
                  <Text style={styles.featureEmoji}>{feature.emoji}</Text>
                </View>
                <View style={styles.featureCopy}>
                  <Text style={styles.featureTitle}>{feature.title}</Text>
                  <Text style={styles.featureDescription}>{feature.description}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.actions}>
          <PrimaryButton label="회원가입하고 시작" onPress={() => router.push('/signup')} />
          <SecondaryButton label="이미 계정이 있어요" onPress={() => router.push('/login')} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 620,
    gap: spacing.s24,
    justifyContent: 'space-between',
    paddingBottom: spacing.s12,
    paddingTop: spacing.s12,
  },
  content: {
    flex: 1,
    gap: spacing.s24,
    justifyContent: 'center',
  },
  hero: {
    alignItems: 'center',
    gap: spacing.s12,
  },
  icon: {
    width: 104,
    height: 104,
    borderRadius: 26,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.authTitle,
    fontWeight: fontWeights.extraBold,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.rank,
    lineHeight: 22,
    textAlign: 'center',
  },
  features: {
    gap: spacing.s10,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s14,
    backgroundColor: colors.brandSoft,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.brandSoftBorder,
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s14,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandWash,
  },
  featureEmoji: {
    fontSize: fontSizes.summaryValue,
  },
  featureCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  featureTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  featureDescription: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 18,
  },
  actions: { gap: 10 },
});
