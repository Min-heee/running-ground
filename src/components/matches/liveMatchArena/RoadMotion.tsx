import { memo, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import {
  DUEL_STRIPES,
  GROUP_STRIPES,
  ROAD_STRIPE_SPACING,
  SHOULD_ANIMATE_ROAD,
} from '@/components/matches/liveMatchArena/helpers';
import { USE_ANDROID_LIGHTWEIGHT_LIVE_MATCH_UI } from '@/components/matches/liveMatchArena/config';
import { liveMatchArenaStyles as styles } from '@/components/matches/liveMatchArena/styles';
import { useDevRenderCounter } from '@/utils/useDevRenderCounter';

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

const GroupRoadBaseLayer = memo(function GroupRoadBaseLayer() {
  return <View style={styles.groupRoadBase} />;
});

const FinishRibbon = memo(function FinishRibbon({
  laneMode,
}: {
  laneMode: 'duel' | 'group';
}) {
  return (
    <View style={[styles.finishRibbon, laneMode === 'group' ? styles.finishRibbonGroup : undefined]}>
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

const GroupRoadMarkings = memo(function GroupRoadMarkings({
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
        styles.groupCenterMarkingsWrap,
        SHOULD_ANIMATE_ROAD ? roadMotionStyle : undefined,
      ]}
    >
      {stripeItems}
    </MotionWrap>
  );
});

export const RoadMotion = memo(function RoadMotion({
  laneMode,
}: {
  laneMode: 'duel' | 'group';
}) {
  useDevRenderCounter(`RoadMotion:${laneMode}`);

  if (!SHOULD_ANIMATE_ROAD) {
    return <StaticRoadMotion laneMode={laneMode} />;
  }

  return <AnimatedRoadMotion laneMode={laneMode} />;
});

const StaticRoadMotion = memo(function StaticRoadMotion({
  laneMode,
}: {
  laneMode: 'duel' | 'group';
}) {
  const duelStripeItems = useMemo(() => DUEL_STRIPES.map((_, index) => (
    <View key={`duel-stripe-${index}`} style={styles.duelStripeRow}>
      <View style={styles.duelStripe} />
      <View style={styles.duelStripe} />
    </View>
  )), []);
  const groupStripeItems = useMemo(() => GROUP_STRIPES.map((_, index) => (
    <View key={`group-stripe-${index}`} style={styles.groupStripe} />
  )), []);

  return (
    <View style={styles.roadBackground}>
      {laneMode === 'duel' ? (
        <>
          <DuelRoadBaseLayer />
          <DuelRoadMarkings
            MotionWrap={View}
            stripeItems={duelStripeItems}
          />
        </>
      ) : (
        <>
          <GroupRoadBaseLayer />
          <GroupRoadMarkings
            MotionWrap={View}
            stripeItems={groupStripeItems}
          />
        </>
      )}
      <FinishRibbon laneMode={laneMode} />
    </View>
  );
});

const AnimatedRoadMotion = memo(function AnimatedRoadMotion({
  laneMode,
}: {
  laneMode: 'duel' | 'group';
}) {
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
  const groupStripeItems = useMemo(() => GROUP_STRIPES.map((_, index) => (
    <View key={`group-stripe-${index}`} style={styles.groupStripe} />
  )), []);

  return (
    <View style={styles.roadBackground}>
      {laneMode === 'duel' ? (
        <>
          <DuelRoadBaseLayer />
          <DuelRoadMarkings
            MotionWrap={Animated.View}
            roadMotionStyle={roadMotionStyle}
            stripeItems={duelStripeItems}
          />
        </>
      ) : (
        <>
          <GroupRoadBaseLayer />
          <GroupRoadMarkings
            MotionWrap={Animated.View}
            roadMotionStyle={roadMotionStyle}
            stripeItems={groupStripeItems}
          />
        </>
      )}
      <FinishRibbon laneMode={laneMode} />
    </View>
  );
});
