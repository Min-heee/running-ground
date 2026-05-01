import { Pressable, StyleSheet, Text } from 'react-native';

export function SecondaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable style={[styles.button, disabled ? styles.buttonDisabled : null]} onPress={onPress} disabled={disabled}>
      <Text style={[styles.text, disabled ? styles.textDisabled : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D0D5DD',
  },
  buttonDisabled: {
    backgroundColor: '#F2F4F7',
    borderColor: '#EAECF0',
  },
  text: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 16,
  },
  textDisabled: {
    color: '#98A2B3',
  },
});
