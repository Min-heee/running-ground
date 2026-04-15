import { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { ConnectedSource } from '@/domain/types';
import { getRecommendedNativeHealthReadiness } from '@/integrations/nativeHealth';

export function NativeHealthReadinessCard({
  sources,
  children,
}: PropsWithChildren<{ sources: ConnectedSource[] }>) {
  const readiness = getRecommendedNativeHealthReadiness(sources);

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

      <View style={styles.steps}>
        {readiness.steps.map((step) => (
          <Text key={step} style={styles.stepText}>• {step}</Text>
        ))}
      </View>

      {children ? <View style={styles.footer}>{children}</View> : null}
    </Card>
  );
}

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
    color: '#6B7280',
    fontWeight: '700',
    fontSize: 12,
  },
  title: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  description: {
    color: '#475467',
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
    color: '#344054',
    lineHeight: 20,
  },
});

const badgeStyles = StyleSheet.create({
  mobile_required: {
    backgroundColor: '#F3F4F6',
  },
  connect_source_first: {
    backgroundColor: '#FEF3C7',
  },
  wrong_platform: {
    backgroundColor: '#F3F4F6',
  },
  needs_custom_build: {
    backgroundColor: '#FEF3C7',
  },
  config_ready: {
    backgroundColor: '#ECFDF3',
  },
});

const badgeTextStyles = StyleSheet.create({
  mobile_required: {
    color: '#374151',
  },
  connect_source_first: {
    color: '#92400E',
  },
  wrong_platform: {
    color: '#374151',
  },
  needs_custom_build: {
    color: '#92400E',
  },
  config_ready: {
    color: '#067647',
  },
});
