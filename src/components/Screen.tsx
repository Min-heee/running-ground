import { MutableRefObject, PropsWithChildren, useEffect, useRef } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';

export function Screen({
  children,
  scrollToTopKey,
  scrollRef,
}: PropsWithChildren<{
  scrollToTopKey?: string;
  scrollRef?: MutableRefObject<ScrollView | null>;
}>) {
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
    <SafeAreaView style={styles.safe}>
      <ScrollView ref={activeScrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.inner}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F5F7FB',
  },
  content: {
    paddingBottom: 120,
  },
  inner: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 14,
  },
});
