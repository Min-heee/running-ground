import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type ButtonVariant = 'primary' | 'secondary';

type ButtonProps = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  variant?: ButtonVariant;
};

export function Button({ label, onPress, disabled = false, variant = 'primary' }: ButtonProps) {
  const isSecondary = variant === 'secondary';

  return (
    <Pressable
      style={[
        styles.button,
        isSecondary ? styles.secondaryButton : styles.primaryButton,
        !isSecondary && disabled ? styles.primaryButtonDisabled : undefined,
        isSecondary && disabled ? styles.secondaryButtonDisabled : undefined,
      ]}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      android_ripple={{ color: 'rgba(0, 0, 0, 0.12)' }}
    >
      <Text
        style={[
          styles.text,
          isSecondary ? styles.secondaryText : styles.primaryText,
          isSecondary && disabled ? styles.secondaryTextDisabled : undefined,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: radii.lg,
    paddingVertical: spacing.s16,
    alignItems: 'center',
    overflow: 'hidden',
  },
  primaryButton: {
    backgroundColor: colors.brand,
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  secondaryButtonDisabled: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderSoft,
  },
  text: {
    fontSize: fontSizes.button,
  },
  primaryText: {
    color: colors.white,
    fontWeight: fontWeights.extraBold,
  },
  secondaryText: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
  },
  secondaryTextDisabled: {
    color: colors.textTertiary,
  },
});
