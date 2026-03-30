import { Pressable, StyleSheet, Text } from 'react-native';

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
    backgroundColor: '#6D5EF7',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  text: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
});
