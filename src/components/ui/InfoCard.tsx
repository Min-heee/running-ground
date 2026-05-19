import { PropsWithChildren } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Card } from '@/components/Card';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

export function InfoCard({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <Card>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{children}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
    color: colors.textPrimary,
  },
  body: {
    color: colors.textMuted,
    lineHeight: 21,
    marginTop: spacing.lg,
  },
});
