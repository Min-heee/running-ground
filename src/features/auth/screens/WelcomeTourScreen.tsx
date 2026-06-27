import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, AppState, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import {
  getOnboardingPermissionStatuses,
  isBatteryControlAvailable,
  ONBOARDING_PERMISSION_CAN_ASK,
  ONBOARDING_PERMISSION_DENIED,
  readBatteryExempt,
  requestBatteryExemption,
  requestHealthConnect,
  requestLocation,
  requestMotion,
  requestNotifications,
  type OnboardingPermissionCanAsk,
  type OnboardingPermissionKey,
  type OnboardingPermissionStatuses,
} from '@/features/auth/onboarding/onboardingPermissions';
import {
  resolvePermissionRowAction,
  type PermissionRowActionKind,
} from '@/features/auth/onboarding/permissionStepModel';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type TourStep = 'welcome' | 'permissions' | 'connect';

const STEP_ORDER: TourStep[] = ['welcome', 'permissions', 'connect'];

type PermissionItem = {
  key: OnboardingPermissionKey;
  label: string;
  hint: string;
  request: () => Promise<boolean>;
};

// 위치 권한은 fg + bg("항상")를 하나의 행으로 합쳐 별도로 렌더해요 (아래 본문 참고). 여기엔
// 알림·동작만 두고, 각 행은 자기 권한의 OS 다이얼로그만 띄워요.
const PERMISSION_ITEMS: PermissionItem[] = [
  {
    key: 'notifications',
    label: '알림',
    hint: '대결 초대와 시작·중간 차이 알림을 받을 수 있어요.',
    request: requestNotifications,
  },
  {
    key: 'motion',
    label: '동작·피트니스',
    hint: '걸음 수로 케이던스(분당 걸음)를 보여줘요.',
    request: requestMotion,
  },
];

// 연동 카드는 별도 단계(STEP 2)지만, 헬스 연동도 같은 “허용/연동” UX로 인라인 처리해요.
const HEALTH_ITEM: { key: OnboardingPermissionKey; label: string; hint: string } = {
  key: 'health',
  label: Platform.OS === 'android' ? 'Health Connect 연동' : 'Apple 건강 연동',
  hint: Platform.OS === 'android'
    ? 'Health Connect의 러닝 기록을 가져와 한 곳에 모아요.'
    : 'Apple 건강의 러닝 기록을 가져와 한 곳에 모아요.',
};

const StepDots = memo(function StepDots({ activeIndex }: { activeIndex: number }) {
  return (
    <View style={styles.dots} accessibilityLabel={`${activeIndex + 1} / ${STEP_ORDER.length}`}>
      {STEP_ORDER.map((step, index) => (
        <View key={step} style={index === activeIndex ? styles.dotActive : styles.dot} />
      ))}
    </View>
  );
});

const PermissionRow = memo(function PermissionRow({
  label,
  hint,
  granted,
  canAsk,
  busy,
  noteText,
  onRequest,
  onOpenSettings,
}: {
  label: string;
  hint: string;
  granted: boolean;
  canAsk: boolean;
  busy: boolean;
  noteText?: string;
  onRequest: () => void;
  onOpenSettings: () => void;
}) {
  const action: PermissionRowActionKind = resolvePermissionRowAction({ granted, canAsk });

  return (
    <View style={styles.permissionRow}>
      <View style={styles.permissionCopy}>
        <Text style={styles.permissionLabel}>{label}</Text>
        <Text style={styles.permissionHint}>{hint}</Text>
        {noteText ? <Text style={styles.permissionNote}>{noteText}</Text> : null}
      </View>
      <View style={styles.permissionControl}>
        {action === 'granted' ? (
          <Text style={[styles.permissionBadge, styles.permissionBadgeOn]}>✓ 허용됨</Text>
        ) : busy ? (
          <ActivityIndicator color={colors.brandLighter} />
        ) : action === 'open_settings' ? (
          <Pressable accessibilityRole="button" onPress={onOpenSettings} style={styles.permissionButton}>
            <Text style={styles.permissionButtonText}>설정 열기</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={onRequest} style={styles.permissionButton}>
            <Text style={styles.permissionButtonText}>허용하기</Text>
          </Pressable>
        )}
        {action !== 'granted' && !busy ? <Text style={styles.permissionLater}>나중에 가능</Text> : null}
      </View>
    </View>
  );
});

export default function WelcomeTourScreen() {
  const [step, setStep] = useState<TourStep>('welcome');
  const [statuses, setStatuses] = useState<OnboardingPermissionStatuses>(ONBOARDING_PERMISSION_DENIED);
  const [canAsk, setCanAsk] = useState<OnboardingPermissionCanAsk>(ONBOARDING_PERMISSION_CAN_ASK);
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
      let next: { statuses: OnboardingPermissionStatuses; canAsk: OnboardingPermissionCanAsk } | null = null;
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
    router.replace('/connect-sources');
  }, []);

  const handleStart = useCallback(() => {
    router.replace('/(tabs)/home');
  }, []);

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Text style={styles.logo}>RunningGround</Text>
          <StepDots activeIndex={activeIndex} />
        </View>

        {step === 'welcome' ? (
          <View style={styles.heroCard}>
            <View style={styles.iconBadge}>
              <Text style={styles.icon}>🏁</Text>
            </View>
            <Text style={styles.kicker}>WELCOME</Text>
            <Text style={styles.title}>달리기, 이제 진짜 승부</Text>
            <Text style={styles.description}>
              매칭으로 만난 러너와 실시간 대결. 거리와 페이스로 승부를 가리고 랭크를 올려요.
            </Text>
          </View>
        ) : null}

        {step === 'permissions' ? (
          <View style={styles.heroCard}>
            <Text style={styles.kicker}>STEP 1 · 권한</Text>
            <Text style={styles.permissionTitle}>권한 허용</Text>
            <Text style={styles.permissionSubtitle}>
              필요한 권한을 지금 켜두면 바로 달릴 수 있어요. 건너뛰어도 되고, 나중에 설정에서 켤 수 있어요.
            </Text>
            <View style={styles.permissionList}>
              {/* Merged 위치 row: driven by the BACKGROUND ("항상") status. ✓ only when backgroundLocation
                  is granted; onRequest sequences foreground→background via requestLocation. The orange
                  note appears only in the fg-granted-but-not-always state. */}
              <PermissionRow
                key="location"
                label="위치"
                hint="GPS로 러닝 경로·거리·페이스를 측정해요. 화면을 꺼도 대결·러닝 측정이 끊기지 않으려면 '항상 허용'이 필요해요."
                granted={statuses.backgroundLocation}
                canAsk={canAsk.backgroundLocation}
                busy={busyKey === 'backgroundLocation'}
                noteText={
                  statuses.location && !statuses.backgroundLocation
                    ? "화면을 꺼도 측정하려면 '항상 허용'이 필요해요. (설정 › 위치 › 항상)"
                    : undefined
                }
                onRequest={() => {
                  void runRequest('backgroundLocation', requestLocation);
                }}
                onOpenSettings={handleOpenSettings}
              />
              {PERMISSION_ITEMS.map((item) => (
                <PermissionRow
                  key={item.key}
                  label={item.label}
                  hint={item.hint}
                  granted={statuses[item.key]}
                  canAsk={canAsk[item.key]}
                  busy={busyKey === item.key}
                  onRequest={() => {
                    void runRequest(item.key, item.request);
                  }}
                  onOpenSettings={handleOpenSettings}
                />
              ))}
              {batteryAvailable ? (
                // Android-only. canAsk is always true (no "denied" state — the settings intent can
                // always be re-fired), so this shows 허용하기 until the user returns exempt. onOpenSettings
                // re-fires the same intent.
                <PermissionRow
                  key="battery"
                  label="배터리 최적화 제외"
                  hint="화면을 꺼도 대결·러닝 측정이 멈추지 않아요."
                  granted={batteryExempt}
                  canAsk
                  busy={batteryBusy}
                  onRequest={() => {
                    void handleRequestBattery();
                  }}
                  onOpenSettings={() => {
                    void handleRequestBattery();
                  }}
                />
              ) : null}
              <PermissionRow
                key={HEALTH_ITEM.key}
                label={HEALTH_ITEM.label}
                hint={HEALTH_ITEM.hint}
                granted={statuses.health}
                canAsk={canAsk.health}
                busy={busyKey === 'health'}
                onRequest={() => {
                  void runRequest('health', requestHealthConnect);
                }}
                onOpenSettings={handleOpenSettings}
              />
            </View>
            <Text style={styles.deniedHint}>
              일부 권한을 꺼도 시작할 수 있어요. 위치 “항상 허용”은 휴대폰 설정 &gt; 위치에서 바꿔야 할 수 있어요.
              설정에서 켜고 돌아오면 자동으로 확인돼요.
            </Text>
          </View>
        ) : null}

        {step === 'connect' ? (
          <View style={styles.heroCard}>
            <View style={styles.iconBadge}>
              <Text style={styles.icon}>🔗</Text>
            </View>
            <Text style={styles.kicker}>STEP 2 · 선택</Text>
            <Text style={styles.title}>기록 연동</Text>
            <Text style={styles.description}>
              NRC·Strava·애플워치·갤럭시워치 기록을 가져와 한 곳에 모을 수 있어요. 나중에 설정에서도 할 수 있어요.
            </Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          {step === 'welcome' ? (
            <PrimaryButton label="시작하기" onPress={() => setStep('permissions')} />
          ) : null}

          {step === 'permissions' ? (
            // Advancing is NEVER blocked: 다음 always moves on regardless of grant state, and
            // 건너뛰기 jumps straight home. First-run can never be trapped here.
            <>
              <PrimaryButton label="다음" onPress={() => setStep('connect')} />
              <SecondaryButton label="건너뛰고 시작하기" onPress={handleStart} />
            </>
          ) : null}

          {step === 'connect' ? (
            <>
              <PrimaryButton label="기록 연동하기" onPress={handleConnect} />
              <SecondaryButton label="건너뛰고 시작하기" onPress={handleStart} />
            </>
          ) : null}
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
  heroCard: {
    backgroundColor: colors.night,
    borderRadius: radii.heroLg,
    gap: spacing.s12,
    overflow: 'hidden',
    paddingHorizontal: spacing.s24,
    paddingVertical: spacing.s24,
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
  },
  description: {
    color: colors.lavenderSoft,
    fontSize: fontSizes.large,
    lineHeight: 26,
  },
  permissionTitle: {
    color: colors.white,
    fontSize: fontSizes.authTitle,
    fontWeight: fontWeights.black,
    lineHeight: 40,
  },
  permissionSubtitle: {
    color: colors.lavenderSoft,
    fontSize: fontSizes.rank,
    lineHeight: 22,
  },
  permissionList: {
    gap: spacing.s10,
    marginTop: spacing.sm,
  },
  permissionRow: {
    alignItems: 'center',
    backgroundColor: colors.translucentWhite18,
    borderRadius: radii.lg,
    flexDirection: 'row',
    gap: spacing.s12,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s12,
  },
  permissionCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  permissionLabel: {
    color: colors.white,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.extraBold,
  },
  permissionHint: {
    color: colors.lavenderSoft,
    fontSize: fontSizes.xs,
    lineHeight: 16,
  },
  permissionNote: {
    color: colors.orange,
    fontSize: fontSizes.xs,
    lineHeight: 16,
    marginTop: spacing.xxs,
  },
  permissionControl: {
    alignItems: 'flex-end',
    gap: spacing.xxs,
    minWidth: 76,
  },
  permissionButton: {
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.xs,
  },
  permissionButtonText: {
    color: colors.white,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
  },
  permissionLater: {
    color: colors.lavenderSoft,
    fontSize: fontSizes.xxs,
  },
  permissionBadge: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
    overflow: 'hidden',
  },
  permissionBadgeOn: {
    color: colors.green,
  },
  deniedHint: {
    color: colors.lavenderSoft,
    fontSize: fontSizes.xs,
    lineHeight: 18,
    marginTop: spacing.xs,
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
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    height: 8,
    width: 26,
  },
  actions: {
    gap: spacing.s10,
  },
});
