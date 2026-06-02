import { Text, StyleSheet } from 'react-native';
import { colors } from '@/theme';

export function ListRow({ children }: { children: string }) {
  return <Text style={styles.row}>{children}</Text>;
}

const styles = StyleSheet.create({
  row: {
    color: colors.textBody,
    paddingVertical: 8,
    fontWeight: '600',
  },
});
