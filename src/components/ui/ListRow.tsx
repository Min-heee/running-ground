import { Text, StyleSheet } from 'react-native';

export function ListRow({ children }: { children: string }) {
  return <Text style={styles.row}>{children}</Text>;
}

const styles = StyleSheet.create({
  row: {
    color: '#344054',
    paddingVertical: 8,
    fontWeight: '600',
  },
});
