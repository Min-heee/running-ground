import { Image, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { colors, radii, spacing, fontSizes, fontWeights } from '@/theme/tokens';

const appIcon = require('../../../../assets/branding/icon.png');

export default function OnboardingScreen() {
  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.content}>
          <Image source={appIcon} style={styles.icon} resizeMode="cover" />
          <Text style={styles.title}>러닝그라운드</Text>
          <Text style={styles.subtitle}>실시간 대결하고 랭킹을 확인할 수 있는 러닝앱</Text>
          <View style={styles.chips}>
            <View style={styles.chip}>
              <Text style={styles.chipText}>실시간 대결</Text>
            </View>
            <View style={styles.chip}>
              <Text style={styles.chipText}>지역 랭킹</Text>
            </View>
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
    paddingBottom: spacing.s12,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s12,
  },
  icon: {
    width: 76,
    height: 76,
    borderRadius: 22,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.comingSoon,
    fontWeight: fontWeights.extraBold,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    lineHeight: 22,
    textAlign: 'center',
  },
  chips: {
    flexDirection: 'row',
    gap: spacing.xxl,
    marginTop: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.brandSoft,
  },
  chipText: {
    color: colors.brandStrong,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  actions: { gap: 10 },
});
