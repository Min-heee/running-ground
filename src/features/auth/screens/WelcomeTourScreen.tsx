import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Screen } from '@/components/Screen';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type WelcomeTourSlide = {
  description: string;
  icon: string;
  kicker: string;
  title: string;
};

type WelcomeTourSlidePageProps = {
  index: number;
  slide: WelcomeTourSlide;
  slideWidth: number;
};

const welcomeTourSlides: WelcomeTourSlide[] = [
  {
    description: '혼자 뛰던 러닝을 친구·지역과 비교하며 경쟁으로 바꿔요.',
    icon: '🏁',
    kicker: 'WELCOME',
    title: '러닝이 경쟁이 되는 앱',
  },
  {
    description: '비슷한 페이스의 러너와 1대1, 친구들과 파티런 그룹 대결로 LP를 쌓고 랭크를 올려요.',
    icon: '⚡',
    kicker: 'MATCH',
    title: '1대1 · 그룹 대결',
  },
  {
    description: '이미 쓰던 NRC·Strava·애플워치·갤럭시워치 기록을 가져와 한 곳에 모아요.',
    icon: '🔗',
    kicker: 'SYNC',
    title: '기록 연동',
  },
];

const WelcomeTourSlidePage = memo(function WelcomeTourSlidePage({
  index,
  slide,
  slideWidth,
}: WelcomeTourSlidePageProps) {
  const slideStyle = useMemo(() => [styles.slide, { width: slideWidth }], [slideWidth]);

  return (
    <View style={slideStyle}>
      <View style={styles.iconBadge} accessibilityLabel={`${index + 1}번째 소개`}>
        <Text style={styles.icon}>{slide.icon}</Text>
      </View>
      <Text style={styles.kicker}>{slide.kicker}</Text>
      <Text style={styles.title}>{slide.title}</Text>
      <Text style={styles.description}>{slide.description}</Text>
    </View>
  );
});

const PaginationDot = memo(function PaginationDot({ active }: { active: boolean }) {
  return <View style={active ? styles.dotActive : styles.dot} />;
});

export default function WelcomeTourScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const { width } = useWindowDimensions();
  const slideWidth = Math.max(280, width - spacing.s16 * 2);
  const [activeIndex, setActiveIndex] = useState(0);
  const isLastSlide = activeIndex === welcomeTourSlides.length - 1;

  const handleSkip = useCallback(() => {
    router.replace('/(tabs)/home');
  }, []);

  const handleConnectSources = useCallback(() => {
    router.replace('/connect-sources');
  }, []);

  const handleNext = useCallback(() => {
    const nextIndex = Math.min(activeIndex + 1, welcomeTourSlides.length - 1);
    scrollRef.current?.scrollTo({ x: nextIndex * slideWidth, animated: true });
    setActiveIndex(nextIndex);
  }, [activeIndex, slideWidth]);

  const handleMomentumScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / slideWidth);
    const clampedIndex = Math.max(0, Math.min(nextIndex, welcomeTourSlides.length - 1));
    setActiveIndex(clampedIndex);
  }, [slideWidth]);

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Text style={styles.logo}>RunningGround</Text>
          <SecondaryButton label="건너뛰기" onPress={handleSkip} />
        </View>

        <View style={styles.carouselCard}>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            onMomentumScrollEnd={handleMomentumScrollEnd}
            scrollEventThrottle={16}
            showsHorizontalScrollIndicator={false}
          >
            <WelcomeTourSlidePage index={0} slide={welcomeTourSlides[0]} slideWidth={slideWidth} />
            <WelcomeTourSlidePage index={1} slide={welcomeTourSlides[1]} slideWidth={slideWidth} />
            <WelcomeTourSlidePage index={2} slide={welcomeTourSlides[2]} slideWidth={slideWidth} />
          </ScrollView>

          <View style={styles.dots} accessibilityLabel={`${activeIndex + 1} / ${welcomeTourSlides.length}`}>
            <PaginationDot active={activeIndex === 0} />
            <PaginationDot active={activeIndex === 1} />
            <PaginationDot active={activeIndex === 2} />
          </View>
        </View>

        <View style={styles.actions}>
          {isLastSlide ? (
            <>
              <PrimaryButton label="기록 연동하기" onPress={handleConnectSources} />
              <SecondaryButton label="바로 시작하기" onPress={handleSkip} />
            </>
          ) : (
            <>
              <PrimaryButton label="다음" onPress={handleNext} />
              <SecondaryButton label="홈으로 바로 가기" onPress={handleSkip} />
            </>
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.s20,
    justifyContent: 'space-between',
    minHeight: 660,
    paddingBottom: spacing.s12,
    paddingTop: spacing.s12,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.s12,
    justifyContent: 'space-between',
  },
  logo: {
    color: colors.brand,
    fontSize: fontSizes.large,
    fontWeight: fontWeights.black,
  },
  carouselCard: {
    backgroundColor: colors.night,
    borderRadius: radii.heroLg,
    gap: spacing.s20,
    overflow: 'hidden',
    paddingBottom: spacing.s24,
    paddingTop: spacing.s24,
  },
  slide: {
    alignItems: 'center',
    gap: spacing.s12,
    justifyContent: 'center',
    minHeight: 420,
    paddingHorizontal: spacing.s24,
  },
  iconBadge: {
    alignItems: 'center',
    backgroundColor: colors.translucentWhite18,
    borderColor: colors.brandLavender,
    borderRadius: 40,
    borderWidth: 1,
    height: 80,
    justifyContent: 'center',
    marginBottom: spacing.s10,
    width: 80,
  },
  icon: {
    fontSize: 38,
  },
  kicker: {
    color: colors.brandLighter,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
    letterSpacing: 1,
  },
  title: {
    color: colors.white,
    fontSize: fontSizes.authTitle,
    fontWeight: fontWeights.black,
    lineHeight: 40,
    textAlign: 'center',
  },
  description: {
    color: colors.lavenderSoft,
    fontSize: fontSizes.large,
    lineHeight: 26,
    maxWidth: 300,
    textAlign: 'center',
  },
  dots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  dot: {
    backgroundColor: colors.slateSoft,
    borderRadius: radii.pill,
    height: 8,
    width: 8,
  },
  dotActive: {
    backgroundColor: colors.white,
    borderRadius: radii.pill,
    height: 8,
    width: 26,
  },
  actions: {
    gap: spacing.s10,
  },
});
