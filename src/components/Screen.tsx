import { MutableRefObject, PropsWithChildren, useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@/theme/tokens';

export function Screen({
  children,
  scrollToTopKey,
  scrollRef,
}: PropsWithChildren<{
  scrollToTopKey?: string;
  scrollRef?: MutableRefObject<ScrollView | null>;
}>) {
  const insets = useSafeAreaInsets();
  const internalScrollRef = useRef<ScrollView>(null);
  const activeScrollRef = scrollRef ?? internalScrollRef;

  useEffect(() => {
    if (!scrollToTopKey) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      activeScrollRef.current?.scrollTo({ y: 0, animated: false });
    });

    return () => cancelAnimationFrame(frameId);
  }, [activeScrollRef, scrollToTopKey]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        ref={activeScrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: 120 + Math.max(insets.bottom, 16) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.inner}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.surfaceApp,
  },
  content: {
    paddingBottom: 136,
  },
  inner: {
    paddingHorizontal: spacing.s16,
    paddingTop: spacing.s12,
    gap: spacing.s14,
  },
});
