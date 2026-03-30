import { PropsWithChildren } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Card } from '@/components/Card';

export function InfoCard({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <Card>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{children}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  body: {
    color: '#475467',
    lineHeight: 21,
    marginTop: 6,
  },
});
