import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import type { TourStep } from './welcomeTourData';
import { spacing } from '@/theme/tokens';

export const TourActions = memo(function TourActions({
  step,
  onBeginPermissions,
  onAdvanceToConnect,
  onConnect,
  onStart,
}: {
  step: TourStep;
  onBeginPermissions: () => void;
  onAdvanceToConnect: () => void;
  onConnect: () => void;
  onStart: () => void;
}) {
  return (
    <View style={styles.actions}>
      {step === 'welcome' ? (
        <PrimaryButton label="시작하기" onPress={onBeginPermissions} />
      ) : null}

      {step === 'permissions' ? (
        // Advancing is NEVER blocked: 다음 always moves on regardless of grant state, and
        // 건너뛰기 jumps straight home. First-run can never be trapped here.
        <>
          <PrimaryButton label="다음" onPress={onAdvanceToConnect} />
          <SecondaryButton label="건너뛰고 시작하기" onPress={onStart} />
        </>
      ) : null}

      {step === 'connect' ? (
        <>
          <PrimaryButton label="기록 연동하기" onPress={onConnect} />
          <SecondaryButton label="건너뛰고 시작하기" onPress={onStart} />
        </>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  actions: {
    gap: spacing.s10,
  },
});
