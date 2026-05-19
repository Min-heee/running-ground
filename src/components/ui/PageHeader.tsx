import { Feather } from '@expo/vector-icons';
import { type Href, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/tokens';

export function PageHeader({
  title,
  subtitle,
  showBack = false,
  backLabel = '뒤로가기',
  backHref,
}: {
  title: string;
  subtitle?: string;
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
          <Feather name="chevron-left" size={16} color={colors.textPrimary} />
          <Text style={styles.backButtonText}>{backLabel}</Text>
        </Pressable>
      ) : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 6,
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backButtonText: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
    includeFontPadding: false,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textHeading,
  },
  subtitle: {
    color: colors.textMuted,
    lineHeight: 21,
  },
});
