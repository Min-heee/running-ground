import { StyleSheet, Text } from 'react-native';

import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

type HomeOtaUpdateCardProps = {
  onApply: () => void;
};

// Non-blocking OTA update prompt. Rendered ONLY on the HOME tab, and only when
// useOtaUpdatePrompt says no run/match could be active (see that hook's guard).
export function HomeOtaUpdateCard({ onApply }: HomeOtaUpdateCardProps) {
  return (
    <Card style={styles.updateCard}>
      <Text style={styles.updateTitle}>새 버전이 준비됐어요</Text>
      <Text style={styles.updateMessage}>잠깐 화면이 새로고침된 후 바로 이어서 쓸 수 있어요.</Text>
      <PrimaryButton label="지금 적용" onPress={onApply} />
    </Card>
  );
}

const styles = StyleSheet.create({
  updateCard: {
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.brandSoftBorder,
    gap: spacing.s10,
  },
  updateTitle: {
    color: colors.textHeading,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.black,
  },
  updateMessage: {
    color: colors.textMuted,
    fontSize: fontSizes.md,
    lineHeight: 20,
  },
});
