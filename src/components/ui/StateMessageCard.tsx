import { StyleSheet, Text } from 'react-native';

import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { colors, fontSizes, fontWeights } from '@/theme/tokens';

type StateMessageCardProps = {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'default' | 'danger';
};

export function StateMessageCard({
  title,
  message,
  actionLabel,
  onAction,
  tone = 'default',
}: StateMessageCardProps) {
  return (
    <Card>
      <Text style={styles.title}>{title}</Text>
      <Text style={tone === 'danger' ? styles.dangerText : styles.defaultText}>{message}</Text>
      {actionLabel ? <PrimaryButton label={actionLabel} onPress={onAction} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  defaultText: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  dangerText: {
    color: colors.danger,
    fontWeight: fontWeights.bold,
    lineHeight: 20,
  },
});
