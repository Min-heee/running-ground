import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme';

export function AuthHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.logo}>RUNNIGAPP</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8, paddingTop: 10 },
  logo: { color: colors.brandPrimary, fontWeight: '800', fontSize: 13 },
  title: { fontSize: 32, fontWeight: '800', color: colors.textTitle },
  subtitle: { color: colors.textSecondary, lineHeight: 22 },
});
