import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme';

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textTitle,
  },
  subtitle: {
    color: colors.textSecondary,
    lineHeight: 21,
  },
});
