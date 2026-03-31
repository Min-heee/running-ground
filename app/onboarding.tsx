import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { InfoCard } from '@/components/ui/InfoCard';

const features = [
  '친구와 주간 랭킹 경쟁',
  '내 활동과 포인트 한눈에 확인',
  '기록 연동 후 자동 반영',
  '마이페이지에서 연동/설정 관리',
];

export default function OnboardingScreen() {
  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.logo}>RUNNIGAPP</Text>
        <Text style={styles.title}>달린 기록이 바로 경쟁이 되는 러닝 앱</Text>
        <Text style={styles.subtitle}>출시 MVP는 친구 경쟁, 내 활동, 기록 연동처럼 매일 쓰게 될 핵심 흐름에 집중해.</Text>
      </View>

      <Card>
        <View style={styles.featureList}>
          {features.map((feature) => (
            <View key={feature} style={styles.featureRow}>
              <View style={styles.dot} />
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>
      </Card>

      <InfoCard title="처음 시작 흐름">회원가입 또는 로그인 → 기록 연동 → 홈 진입 순서로 바로 시작할 수 있어.</InfoCard>

      <View style={styles.actions}>
        <PrimaryButton label="회원가입하고 시작" onPress={() => router.push('/signup')} />
        <SecondaryButton label="이미 계정이 있어요" onPress={() => router.push('/login')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: '#6D5EF7',
    borderRadius: 28,
    padding: 24,
    gap: 10,
    minHeight: 240,
    justifyContent: 'flex-end',
  },
  logo: { color: '#E9E7FF', fontWeight: '800', fontSize: 13 },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '800', lineHeight: 38 },
  subtitle: { color: '#F4F3FF', lineHeight: 22 },
  featureList: { gap: 14 },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 99,
    backgroundColor: '#6D5EF7',
  },
  featureText: {
    flex: 1,
    color: '#101828',
    fontWeight: '700',
  },
  actions: { gap: 10 },
});
