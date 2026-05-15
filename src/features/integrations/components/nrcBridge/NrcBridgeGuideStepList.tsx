import { memo, useMemo } from 'react';
import { Text, View } from 'react-native';
import { nrcBridgeGuideDetailStyles as styles } from './NrcBridgeGuideSection.styles';
import type { GuideStep } from './types';

type NrcBridgeGuideStepListProps = {
  steps: GuideStep[];
};

export function NrcBridgeGuideStepList({ steps }: NrcBridgeGuideStepListProps) {
  const stepRows = useMemo(() => steps.map((step, index) => (
    <NrcBridgeGuideStepRow key={step.title} index={index} step={step} />
  )), [steps]);

  return (
    <View style={styles.steps}>
      {stepRows}
    </View>
  );
}

const NrcBridgeGuideStepRow = memo(function NrcBridgeGuideStepRow({
  index,
  step,
}: {
  index: number;
  step: GuideStep;
}) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepMarker}>
        <Text style={styles.stepMarkerText}>{index + 1}</Text>
      </View>
      <View style={styles.stepCopy}>
        <Text style={styles.stepTitle}>{step.title}</Text>
        <Text style={styles.stepDescription}>{step.description}</Text>
      </View>
    </View>
  );
});
