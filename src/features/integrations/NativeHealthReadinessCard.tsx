import { memo, PropsWithChildren, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { ConnectedSource } from '@/domain';
import { getRecommendedNativeHealthReadiness } from '@/integrations/nativeHealth';
import { colors } from '@/theme/tokens';

export function NativeHealthReadinessCard({
  sources,
  children,
}: PropsWithChildren<{ sources: ConnectedSource[] }>) {
  const readiness = useMemo(() => getRecommendedNativeHealthReadiness(sources), [sources]);

  if (!readiness) {
    return null;
  }

  return (
    <Card>
      <View style={styles.header}>
        <View style={styles.copy}>
          <Text style={styles.sectionTitle}>기기 자동 연동 준비</Text>
          <Text style={styles.title}>{readiness.title}</Text>
          <Text style={styles.description}>{readiness.description}</Text>
        </View>
        <View style={[styles.badge, badgeStyles[readiness.state]]}>
          <Text style={[styles.badgeText, badgeTextStyles[readiness.state]]}>{readiness.badgeLabel}</Text>
        </View>
      </View>

      <NativeHealthStepList steps={readiness.steps} />

      {children ? <View style={styles.footer}>{children}</View> : null}
    </Card>
  );
}

const NativeHealthStepList = memo(function NativeHealthStepList({ steps }: { steps: string[] }) {
  const stepItems = useMemo(() => steps.map((step) => (
    <Text key={step} style={styles.stepText}>• {step}</Text>
  )), [steps]);

  return <View style={styles.steps}>{stepItems}</View>;
});

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  sectionTitle: {
    color: colors.textNeutral,
    fontWeight: '700',
    fontSize: 12,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  description: {
    color: colors.textMuted,
    lineHeight: 21,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  badgeText: {
    fontWeight: '800',
    fontSize: 12,
  },
  steps: {
    marginTop: 12,
    gap: 6,
  },
  footer: {
    marginTop: 12,
    gap: 8,
  },
  stepText: {
    color: colors.textStrongMuted,
    lineHeight: 20,
  },
});

const badgeStyles = StyleSheet.create({
  mobile_required: {
    backgroundColor: colors.surfaceSubtle,
  },
  connect_source_first: {
    backgroundColor: colors.warningSoft,
  },
  wrong_platform: {
    backgroundColor: colors.surfaceSubtle,
  },
  needs_custom_build: {
    backgroundColor: colors.warningSoft,
  },
  config_ready: {
    backgroundColor: colors.successCard,
  },
});

const badgeTextStyles = StyleSheet.create({
  mobile_required: {
    color: colors.darkSoft,
  },
  connect_source_first: {
    color: colors.podiumBronzeText,
  },
  wrong_platform: {
    color: colors.darkSoft,
  },
  needs_custom_build: {
    color: colors.podiumBronzeText,
  },
  config_ready: {
    color: colors.successText,
  },
});
