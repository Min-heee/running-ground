import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, type ErrorBoundaryProps } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Screen } from '@/components/Screen';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';

const ERROR_STACK_PREVIEW_LINES = 12;

export function RouteErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const errorName = error?.name || 'Error';
  const errorMessage = error?.message || '알 수 없는 화면 렌더 오류';
  const stackPreview = useMemo(
    () => String(error?.stack ?? '')
      .split('\n')
      .slice(0, ERROR_STACK_PREVIEW_LINES)
      .join('\n'),
    [error?.stack],
  );
  const diagnosticText = stackPreview
    ? `${errorName}: ${errorMessage}\n\n${stackPreview}`
    : `${errorName}: ${errorMessage}`;

  useEffect(() => {
    console.error(
      '[RG-CRASH] route render error:',
      errorName,
      errorMessage,
      '\n',
      error?.stack,
    );
  }, [error?.stack, errorMessage, errorName]);

  return (
    <SafeAreaProvider style={styles.provider}>
      <Screen>
        <View style={styles.container}>
          <View style={styles.copy}>
            <Text style={styles.title}>앗, 화면을 표시하는 중 문제가 생겼어요</Text>
            <Text style={styles.subtitle}>
              이 정보를 캡쳐해서 개발자에게 보내주면 빠르게 고칠 수 있어요.
            </Text>
          </View>

          <View style={styles.diagnosticBox}>
            <Text selectable style={styles.diagnosticText}>{diagnosticText}</Text>
          </View>

          <View style={styles.actions}>
            <SecondaryButton label="다시 시도" onPress={() => { void retry(); }} />
            <SecondaryButton label="홈으로" onPress={() => router.replace('/(tabs)/home')} />
          </View>
        </View>
      </Screen>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  provider: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.s20,
    paddingVertical: spacing.s24,
  },
  copy: {
    gap: spacing.s10,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.pageTitle,
    fontWeight: fontWeights.black,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    lineHeight: fontSizes.base + spacing.s10,
  },
  diagnosticBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.s14,
    gap: spacing.s10,
  },
  diagnosticText: {
    color: colors.textMuted,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    lineHeight: fontSizes.xs + spacing.xxl,
  },
  actions: {
    gap: spacing.s10,
  },
});
