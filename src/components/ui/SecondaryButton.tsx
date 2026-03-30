import { Pressable, StyleSheet, Text } from 'react-native';

export function SecondaryButton({ label }: { label: string }) {
  return (
    <Pressable style={styles.button}>
      <Text style={styles.text}>{label}</Text>
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
  text: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 16,
  },
});
