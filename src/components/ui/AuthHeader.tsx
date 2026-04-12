import { Feather } from '@expo/vector-icons';
import { type Href, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function AuthHeader({
  title,
  subtitle,
  showBack = false,
  backLabel = '뒤로가기',
  backHref,
}: {
  title: string;
  subtitle: string;
  showBack?: boolean;
  backLabel?: string;
  backHref?: Href;
}) {
  const canGoBack = () => {
    const navigationRouter = router as typeof router & { canGoBack?: () => boolean };
    return navigationRouter.canGoBack?.() ?? false;
  };

  const handleBack = () => {
    if (canGoBack()) {
      router.back();
      return;
    }

    if (backHref) {
      router.replace(backHref);
      return;
    }

    router.back();
  };

  return (
    <View style={styles.header}>
      {showBack ? (
        <Pressable onPress={handleBack} style={styles.backButton}>
          <Feather name="chevron-left" size={16} color="#111827" />
          <Text style={styles.backButtonText}>{backLabel}</Text>
        </Pressable>
      ) : null}
      <Text style={styles.logo}>RUNNIGAPP</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8, paddingTop: 10 },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#F3F4F6',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backButtonText: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 13,
    includeFontPadding: false,
  },
  logo: { color: '#6D5EF7', fontWeight: '800', fontSize: 13 },
  title: { fontSize: 32, fontWeight: '800', color: '#101828' },
  subtitle: { color: '#475467', lineHeight: 22 },
});
