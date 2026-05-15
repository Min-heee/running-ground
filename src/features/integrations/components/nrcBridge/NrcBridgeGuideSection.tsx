import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { Card } from '@/components/Card';
import { NrcBridgeGuideActionBlock } from './NrcBridgeGuideActionBlock';
import { NrcBridgeGuideHeader } from './NrcBridgeGuideHeader';
import {
  nrcBridgeGuideDetailStyles as styles,
  nrcBridgeGuideSectionStyles,
} from './NrcBridgeGuideSection.styles';
import { NrcBridgeGuideStatusBlock } from './NrcBridgeGuideStatusBlock';
import { NrcBridgeGuideStepList } from './NrcBridgeGuideStepList';
import type { GuideSection } from './types';

type NrcBridgeGuideSectionProps = {
  actionContent: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  section: GuideSection;
};

export function NrcBridgeGuideSection({
  actionContent,
  expanded,
  onToggle,
  section,
}: NrcBridgeGuideSectionProps) {
  return (
    <Card style={styles.card}>
      <NrcBridgeGuideHeader
        expanded={expanded}
        onToggle={onToggle}
        section={section}
      />

      {expanded ? (
        <>
          <NrcBridgeGuideStatusBlock section={section} />
          <NrcBridgeGuideStepList steps={section.steps} />

          <NrcBridgeGuideActionBlock>{actionContent}</NrcBridgeGuideActionBlock>

          {section.footnote ? <Text style={styles.footnote}>{section.footnote}</Text> : null}
        </>
      ) : null}
    </Card>
  );
}

export { nrcBridgeGuideSectionStyles };
