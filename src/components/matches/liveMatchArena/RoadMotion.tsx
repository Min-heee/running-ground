import { memo, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import {
  DUEL_STRIPES,
  GROUP_STRIPES,
  ROAD_STRIPE_SPACING,
  SHOULD_ANIMATE_ROAD,
} from '@/components/matches/liveMatchArena/helpers';
import { liveMatchArenaStyles as styles } from '@/components/matches/liveMatchArena/styles';

const DuelRoadBaseLayer = memo(function DuelRoadBaseLayer() {
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

export const RoadMotion = memo(function RoadMotion({
  laneMode,
}: {
  laneMode: 'duel' | 'group';
}) {
  const shift = useRef(new Animated.Value(0)).current;
  const MotionWrap = SHOULD_ANIMATE_ROAD ? Animated.View : View;

  useEffect(() => {
    if (!SHOULD_ANIMATE_ROAD) {
      shift.stopAnimation();
      shift.setValue(0);
      return undefined;
    }

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
          <MotionWrap
            pointerEvents="none"
            style={[
              styles.duelCenterMarkingsWrap,
              SHOULD_ANIMATE_ROAD ? roadMotionStyle : undefined,
            ]}
          >
            {duelStripeItems}
          </MotionWrap>
        </>
      ) : (
        <>
          <GroupRoadBaseLayer />
          <MotionWrap
            pointerEvents="none"
            style={[
              styles.groupCenterMarkingsWrap,
              SHOULD_ANIMATE_ROAD ? roadMotionStyle : undefined,
            ]}
          >
            {groupStripeItems}
          </MotionWrap>
        </>
      )}
      <FinishRibbon laneMode={laneMode} />
    </View>
  );
});
