import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import type { TourStep } from './welcomeTourData';
import { colors, fontSizes, spacing } from '@/theme/tokens';

export const TourActions = memo(function TourActions({
  step,
  canAdvancePermissions,
  onBeginPermissions,
  onAdvanceToConnect,
  onConnect,
  onStart,
}: {
  step: TourStep;
  canAdvancePermissions: boolean;
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
        // 권한 단계는 필수 게이트: 위치+동작이 켜져야 다음이 열린다. 건너뛰기는 없다 —
        // 권한 없이 홈에 떨어지면 첫 측정이 0.00km로 끝나기 때문. 하드 거부여도 각 행의
        // 설정 열기 → 복귀 시 AppState 재확인으로 풀리므로 갇히는 상태는 없다.
        <>
          {!canAdvancePermissions ? (
            <Text style={styles.gateHint}>위치와 동작 권한을 허용하면 다음으로 넘어갈 수 있어요</Text>
          ) : null}
          <PrimaryButton label="다음" onPress={onAdvanceToConnect} disabled={!canAdvancePermissions} />
        </>
      ) : null}

      {step === 'connect' ? (
        // 연동은 선택: 하러 가면 마이페이지의 기록 연동 관리로 직행, 아니면 홈으로 시작.
        <>
          <PrimaryButton label="기록 연동하러 가기" onPress={onConnect} />
          <SecondaryButton label="나중에 하기" onPress={onStart} />
        </>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  actions: {
    gap: spacing.s10,
  },
  gateHint: {
    color: colors.lavenderSoft,
    fontSize: fontSizes.xs,
    textAlign: 'center',
  },
});
