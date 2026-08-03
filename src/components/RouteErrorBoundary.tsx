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
            {/* 테마 색은 렌더 시점에 읽는다 (Screen/Button과 같은 이유): 이 모듈은
                _layout의 재수출로 테마 하이드레이션 전에 평가되어, StyleSheet에 넣으면
                라이트 값이 굳어 다크에서 어두운 글씨×어두운 배경이 된다. */}
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              앗, 화면을 표시하는 중 문제가 생겼어요
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              이 정보를 캡쳐해서 개발자에게 보내주면 빠르게 고칠 수 있어요.
            </Text>
          </View>

          <View
            style={[
              styles.diagnosticBox,
              { borderColor: colors.border, backgroundColor: colors.surfaceMuted },
            ]}
          >
            <Text selectable style={[styles.diagnosticText, { color: colors.textMuted }]}>
              {diagnosticText}
            </Text>
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
    fontSize: fontSizes.pageTitle,
    fontWeight: fontWeights.black,
  },
  subtitle: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
    lineHeight: fontSizes.base + spacing.s10,
  },
  diagnosticBox: {
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.s14,
    gap: spacing.s10,
  },
  diagnosticText: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    lineHeight: fontSizes.xs + spacing.xxl,
  },
  actions: {
    gap: spacing.s10,
  },
});
