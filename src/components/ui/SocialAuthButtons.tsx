import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { colors, radius } from '@/theme';

type ProviderId = 'kakao' | 'google' | 'apple' | 'naver';

type Intent = 'login' | 'signup';

const VERB: Record<Intent, string> = {
  login: '로그인하기',
  signup: '회원가입하기',
};

const PROVIDERS: { id: ProviderId; name: string }[] = [
  { id: 'kakao', name: '카카오톡' },
  { id: 'google', name: 'Google' },
  { id: 'apple', name: 'Apple' },
  { id: 'naver', name: '네이버' },
];

export function SocialAuthButtons({
  intent,
  onSocialPress,
  showAccountOption = false,
}: {
  intent: Intent;
  onSocialPress: () => void;
  showAccountOption?: boolean;
}) {
  return (
    <View style={styles.actions}>
      {PROVIDERS.map((provider) => {
        const isDarkText = provider.id === 'kakao' || provider.id === 'google';
        return (
          <Pressable
            key={provider.id}
            style={getProviderStyle(provider.id)}
            onPress={onSocialPress}
            accessibilityRole="button"
            accessibilityLabel={`${provider.name}로 ${VERB[intent]}`}
          >
            <Text style={isDarkText ? styles.darkText : styles.lightText}>
              {`${provider.name}로 ${VERB[intent]}`}
            </Text>
          </Pressable>
        );
      })}

      {showAccountOption ? (
        <Link href="/signup-form" asChild>
          <Pressable style={styles.accountButton} accessibilityRole="button" accessibilityLabel={`계정으로 ${VERB[intent]}`}>
            <Text style={styles.darkText}>{`계정으로 ${VERB[intent]}`}</Text>
          </Pressable>
        </Link>
      ) : null}
    </View>
  );
}

function getProviderStyle(id: ProviderId) {
  switch (id) {
    case 'kakao':
      return styles.kakaoButton;
    case 'google':
      return styles.googleButton;
    case 'apple':
      return styles.appleButton;
    case 'naver':
      return styles.naverButton;
  }
}

const baseButton = {
  borderRadius: radius.xl,
  paddingVertical: 16,
  paddingHorizontal: 16,
  alignItems: 'center' as const,
  borderWidth: 1,
};

const styles = StyleSheet.create({
  actions: { gap: 10 },
  kakaoButton: {
    ...baseButton,
    backgroundColor: colors.providerKakao,
    borderColor: colors.providerKakao,
  },
  googleButton: {
    ...baseButton,
    backgroundColor: colors.providerGoogle,
    borderColor: colors.border,
  },
  appleButton: {
    ...baseButton,
    backgroundColor: colors.providerApple,
    borderColor: colors.providerApple,
  },
  naverButton: {
    ...baseButton,
    backgroundColor: colors.providerNaver,
    borderColor: colors.providerNaver,
  },
  accountButton: {
    ...baseButton,
    backgroundColor: colors.brandPrimarySoft,
    borderColor: colors.brandPrimaryMuted,
  },
  darkText: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 16,
  },
  lightText: {
    color: colors.textOnDark,
    fontWeight: '800',
    fontSize: 16,
  },
});
