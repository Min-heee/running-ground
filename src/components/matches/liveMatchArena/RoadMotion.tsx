import { memo, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import {
  DUEL_STRIPES,
  ROAD_STRIPE_SPACING,
  SHOULD_ANIMATE_ROAD,
} from '@/components/matches/liveMatchArena/helpers';
import { USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI } from '@/components/matches/liveMatchArena/config';
import { liveMatchArenaStyles as styles } from '@/components/matches/liveMatchArena/styles';
import { rgPerfMark } from '@/utils/rgPerfTrace';
import { useDevRenderCounter } from '@/utils/useDevRenderCounter';

// 듀얼로드 전용 도로 배경. 그룹 분기(GroupRoadBaseLayer/GroupRoadMarkings)는
// 그룹로드가 F1 타이밍 타워로 바뀌면서(2026-08-05) 소비처가 사라져 제거됐다.

type RoadMotionWrapComponent = typeof Animated.View | typeof View;
type RoadMotionTransformStyle = { transform: { translateY: Animated.AnimatedInterpolation<string | number> }[] };

const DuelRoadBaseLayer = memo(function DuelRoadBaseLayer() {
  if (USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI) {
    return (
      <>
        <View style={styles.duelRoadBase} />
        <View style={styles.duelCenterDivider} />
      </>
    );
  }

  return (
    <>
      <View style={styles.duelRoadBase} />
      <View style={styles.duelCenterDivider} />
      <View style={[styles.duelLaneBase, styles.duelLaneLeft]} />
      <View style={[styles.duelLaneBase, styles.duelLaneRight]} />
    </>
  );
});

const FinishRibbon = memo(function FinishRibbon() {
  return (
    <View style={styles.finishRibbon}>
      <Text style={styles.finishRibbonText}>FINISH</Text>
    </View>
  );
});

const DuelRoadMarkings = memo(function DuelRoadMarkings({
  MotionWrap,
  roadMotionStyle,
  stripeItems,
}: {
  MotionWrap: RoadMotionWrapComponent;
  roadMotionStyle?: RoadMotionTransformStyle;
  stripeItems: ReactNode;
}) {
  return (
    <MotionWrap
      pointerEvents="none"
      style={[
        styles.duelCenterMarkingsWrap,
        SHOULD_ANIMATE_ROAD ? roadMotionStyle : undefined,
      ]}
    >
      {stripeItems}
    </MotionWrap>
  );
});

export const RoadMotion = memo(function RoadMotion() {
  useDevRenderCounter('RoadMotion:duel');
  useEffect(() => {
    rgPerfMark('RoadMotion mount', {
      animated: SHOULD_ANIMATE_ROAD,
      lightweight: USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI,
    });

    return () => {
      rgPerfMark('RoadMotion unmount', {});
    };
  }, []);

  if (!SHOULD_ANIMATE_ROAD) {
    return <StaticRoadMotion />;
  }

  return <AnimatedRoadMotion />;
});

const StaticRoadMotion = memo(function StaticRoadMotion() {
  const duelStripeItems = useMemo(() => DUEL_STRIPES.map((_, index) => (
    <View key={`duel-stripe-${index}`} style={styles.duelStripeRow}>
      <View style={styles.duelStripe} />
      <View style={styles.duelStripe} />
    </View>
  )), []);

  return (
    <View style={styles.roadBackground}>
      <DuelRoadBaseLayer />
      <DuelRoadMarkings
        MotionWrap={View}
        stripeItems={duelStripeItems}
      />
      <FinishRibbon />
    </View>
  );
});

const AnimatedRoadMotion = memo(function AnimatedRoadMotion() {
  const shift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shift, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    loop.start();
    return () => {
      loop.stop();
      shift.stopAnimation();
      shift.setValue(0);
    };
  }, [shift]);

  const translateY = useMemo(() => shift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, ROAD_STRIPE_SPACING],
  }), [shift]);
  const roadMotionStyle = useMemo(() => ({ transform: [{ translateY }] }), [translateY]);
  const duelStripeItems = useMemo(() => DUEL_STRIPES.map((_, index) => (
    <View key={`duel-stripe-${index}`} style={styles.duelStripeRow}>
      <View style={styles.duelStripe} />
      <View style={styles.duelStripe} />
    </View>
  )), []);

  return (
    <View style={styles.roadBackground}>
      <DuelRoadBaseLayer />
      <DuelRoadMarkings
        MotionWrap={Animated.View}
        roadMotionStyle={roadMotionStyle}
        stripeItems={duelStripeItems}
      />
      <FinishRibbon />
    </View>
  );
});
