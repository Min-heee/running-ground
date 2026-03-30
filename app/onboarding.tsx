import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Link } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';

const features = [
  '친구와 주간 랭킹 경쟁',
  '구 내 개인 순위 확인',
  '구 vs 구 지역 배틀 참여',
  '기록 앱 연동으로 자동 반영',
];

export default function OnboardingScreen() {
  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.logo}>RUNNIGAPP</Text>
        <Text style={styles.title}>러닝 기록을 경쟁으로 바꾸자</Text>
        <Text style={styles.subtitle}>평소 쓰던 러닝 앱은 그대로 두고, 경쟁과 랭킹은 여기서 즐기는 모바일 앱.</Text>
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

      <View style={styles.actions}>
        <Link href="/login" asChild>
          <Pressable style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>회원가입</Text>
          </Pressable>
        </Link>
        <Link href="/login" asChild>
          <Pressable style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>이미 계정이 있어요</Text>
          </Pressable>
        </Link>
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
  primaryButton: {
    backgroundColor: '#6D5EF7',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D0D5DD',
  },
  secondaryButtonText: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 16,
  },
});
