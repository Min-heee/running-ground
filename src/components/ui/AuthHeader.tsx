import { Feather } from '@expo/vector-icons';
import { type Href, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

export function AuthHeader({
  title,
  subtitle,
  compact = false,
  showBack = false,
  backLabel = '뒤로가기',
  backHref,
}: {
  title: string;
  subtitle?: string;
  compact?: boolean;
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
      <Text style={styles.logo}>RunningGround</Text>
      <Text style={compact ? compactTitleStyle : styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xxl, paddingTop: 10 },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  backButtonText: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.md,
    includeFontPadding: false,
  },
  logo: { color: colors.brand, fontWeight: fontWeights.extraBold, fontSize: 13 },
  title: { fontSize: fontSizes.authTitle, fontWeight: fontWeights.extraBold, color: colors.textHeading },
  titleCompact: { fontSize: fontSizes.metric },
  subtitle: { color: colors.textMuted, lineHeight: 22 },
});

const compactTitleStyle = [styles.title, styles.titleCompact];
