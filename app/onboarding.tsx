import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';

export default function OnboardingScreen() {
  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.logo}>RUNNIGAPP</Text>
          <Text style={styles.title}>러닝 기록이 경쟁이 되는 앱</Text>
          <Text style={styles.subtitle}>친구와 기록을 비교하고 내 러닝 흐름을 간단하게 쌓아가자.</Text>
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
    justifyContent: 'space-between',
    minHeight: 620,
    paddingTop: 28,
    paddingBottom: 12,
  },
  hero: {
    backgroundColor: '#6D5EF7',
    borderRadius: 28,
    padding: 24,
    gap: 12,
    minHeight: 220,
    justifyContent: 'center',
  },
  logo: { color: '#E9E7FF', fontWeight: '800', fontSize: 13 },
  title: { color: '#FFFFFF', fontSize: 32, fontWeight: '800', lineHeight: 40 },
  subtitle: { color: '#F4F3FF', lineHeight: 22, fontSize: 15 },
  actions: { gap: 10 },
});
