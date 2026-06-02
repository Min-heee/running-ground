import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius } from '@/theme';

export function PrimaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable style={styles.button} onPress={onPress}>
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.xl,
    paddingVertical: 16,
    alignItems: 'center',
  },
  text: {
    color: colors.textOnDark,
    fontWeight: '800',
    fontSize: 16,
  },
});
