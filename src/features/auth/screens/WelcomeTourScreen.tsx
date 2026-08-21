import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { AppState, Linking, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { ConnectStepCard } from '@/features/auth/components/welcomeTour/ConnectStepCard';
import { PermissionsStepCard } from '@/features/auth/components/welcomeTour/PermissionsStepCard';
import { StepDots } from '@/features/auth/components/welcomeTour/StepDots';
import { TourActions } from '@/features/auth/components/welcomeTour/TourActions';
import { WelcomeStepCard } from '@/features/auth/components/welcomeTour/WelcomeStepCard';
import { STEP_ORDER, type TourStep } from '@/features/auth/components/welcomeTour/welcomeTourData';
import { canAdvanceFromPermissionStep } from '@/features/auth/onboarding/permissionStepModel';
import {
  getOnboardingPermissionStatuses,
  isBatteryControlAvailable,
  ONBOARDING_PERMISSION_CAN_ASK,
  ONBOARDING_PERMISSION_DENIED,
  readBatteryExempt,
  requestBatteryExemption,
  type OnboardingPermissionCanAsk,
  type OnboardingPermissionKey,
  type OnboardingPermissionStatuses,
} from '@/features/auth/onboarding/onboardingPermissions';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

export default function WelcomeTourScreen() {
  const [step, setStep] = useState<TourStep>('welcome');
  const [statuses, setStatuses] = useState<OnboardingPermissionStatuses>(ONBOARDING_PERMISSION_DENIED);
  const [canAsk, setCanAsk] = useState<OnboardingPermissionCanAsk>(ONBOARDING_PERMISSION_CAN_ASK);
  // 걸음 센서 없는 기기는 동작 권한을 영원히 못 켜므로 필수 게이트에서 면제해야 한다.
  // 첫 읽기 전 기본값은 false(면제) — 실제 상태가 오기 전에 게이트가 잘못 잠기지 않도록.
  const [motionAvailable, setMotionAvailable] = useState(false);
  // Battery state is isolated Android-only screen-local state — deliberately NOT part of the unified
  // OnboardingPermissionKey model. 'battery' busy is tracked by its own flag, not busyKey.
  const [batteryBusy, setBatteryBusy] = useState(false);

  // busyKey covers the unified permission rows (location/notifications/motion/health). The merged
  // 위치 row uses the 'backgroundLocation' busy key.
  const [busyKey, setBusyKey] = useState<OnboardingPermissionKey | null>(null);

  // batteryAvailable is a constant for the session (hidden on iOS + old Android binaries). batteryExempt
  // is re-read in refreshStatuses and on every AppState 'active' (covers returning from the settings intent).
  const batteryAvailable = isBatteryControlAvailable();
  const [batteryExempt, setBatteryExempt] = useState(false);

  const requestingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const activeIndex = STEP_ORDER.indexOf(step);

  // Skip while a request is in flight so the foreground-refresh and the request don't both write
  // statuses out of order (the request's own re-read is the authoritative one).
  const refreshStatuses = useCallback(async () => {
    if (requestingRef.current) {
      return;
    }
    // Battery exemption read is synchronous and isolated from the permission model — refresh it here
    // and on the AppState 'active' listener so returning from the Android battery-settings intent
    // re-flips the ✓.
    const battery = readBatteryExempt();
    const next = await getOnboardingPermissionStatuses();
    if (mountedRef.current) {
      setStatuses(next.statuses);
      setCanAsk(next.canAsk);
      setMotionAvailable(next.motionAvailable);
      setBatteryExempt(battery);
    }
  }, []);

  // Re-check on mount and whenever the app returns to the foreground — covers the case where the
  // user grants a previously-denied permission from the OS Settings app and comes back.
  useEffect(() => {
    void refreshStatuses();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshStatuses();
      }
    });
    return () => subscription.remove();
  }, [refreshStatuses]);

  // Generic per-permission runner: guards against overlapping requests (so dialogs don't stack),
  // fires only the requested permission, then re-reads the full status set.
  const runRequest = useCallback(async (key: OnboardingPermissionKey, request: () => Promise<boolean>) => {
    if (requestingRef.current) {
      return;
    }
    requestingRef.current = true;
    setBusyKey(key);
    try {
      await request();
    } catch {
      // Never let a permission/connect failure crash or trap onboarding.
    } finally {
      let next: {
        statuses: OnboardingPermissionStatuses;
        canAsk: OnboardingPermissionCanAsk;
        motionAvailable: boolean;
      } | null = null;
      try {
        next = await getOnboardingPermissionStatuses();
      } catch {
        next = null;
      }
      requestingRef.current = false;
      if (mountedRef.current) {
        if (next) {
          setStatuses(next.statuses);
          setCanAsk(next.canAsk);
          setMotionAvailable(next.motionAvailable);
        }
        setBusyKey(null);
      }
    }
  }, []);

  // Android-only battery exemption request. Fires the native settings intent then re-reads the
  // synchronous exempt flag. The real exemption is applied once the user returns from the intent →
  // the AppState 'active' refresh catches it. Kept separate from runRequest / busyKey so 'battery'
  // never enters the OnboardingPermissionKey model.
  const handleRequestBattery = useCallback(async () => {
    if (batteryBusy) {
      return;
    }
    setBatteryBusy(true);
    try {
      await requestBatteryExemption();
    } catch {
      // Never let a battery request crash or trap onboarding.
    } finally {
      const exempt = readBatteryExempt();
      if (mountedRef.current) {
        setBatteryExempt(exempt);
        setBatteryBusy(false);
      }
    }
  }, [batteryBusy]);

  const handleOpenSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  const handleConnect = useCallback(() => {
    // 온보딩의 연동 버튼은 별도 중간 페이지 없이 마이페이지의 기록 연동 관리로 직행한다.
    // (뒤로가기는 그 화면의 기본 backHref인 마이페이지로 떨어져 온보딩으로 되돌아오지 않는다.)
    router.replace('/integration-management');
  }, []);

  const handleStart = useCallback(() => {
    router.replace('/(tabs)/home');
  }, []);

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Text style={styles.logo}>RunningSpace</Text>
          <StepDots activeIndex={activeIndex} />
        </View>

        {step === 'welcome' ? <WelcomeStepCard /> : null}

        {step === 'permissions' ? (
          <PermissionsStepCard
            statuses={statuses}
            canAsk={canAsk}
            busyKey={busyKey}
            batteryAvailable={batteryAvailable}
            batteryExempt={batteryExempt}
            batteryBusy={batteryBusy}
            onRunRequest={runRequest}
            onRequestBattery={handleRequestBattery}
            onOpenSettings={handleOpenSettings}
          />
        ) : null}

        {step === 'connect' ? <ConnectStepCard /> : null}

        <TourActions
          step={step}
          canAdvancePermissions={canAdvanceFromPermissionStep({
            statuses,
            motionAvailable,
            batteryAvailable,
            batteryExempt,
          })}
          onBeginPermissions={() => setStep('permissions')}
          onAdvanceToConnect={() => setStep('connect')}
          onConnect={handleConnect}
          onStart={handleStart}
        />
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
});
