import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, AppState, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import {
  getOnboardingPermissionStatuses,
  ONBOARDING_PERMISSION_CAN_ASK,
  ONBOARDING_PERMISSION_DENIED,
  requestBackgroundLocation,
  requestForegroundLocation,
  requestHealthConnect,
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

// Order matters: foreground location must be granted before background ("always") location can be
// requested, so it comes first. Each row has its own button that fires only that permission's OS
// dialog, and the requests are sequenced (await one before the next) by the per-row handler.
const PERMISSION_ITEMS: PermissionItem[] = [
  {
    key: 'location',
    label: '위치 (사용 중)',
    hint: 'GPS로 러닝 경로·거리·페이스를 측정해요. 러닝 측정의 핵심 권한이에요.',
    request: requestForegroundLocation,
  },
  {
    key: 'backgroundLocation',
    label: '위치 (항상 허용)',
    hint: '화면을 꺼도 대결·러닝 측정이 끊기지 않아요. 먼저 “사용 중”을 허용해야 켤 수 있어요.',
    request: requestBackgroundLocation,
  },
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
  const [busyKey, setBusyKey] = useState<OnboardingPermissionKey | null>(null);

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
    const next = await getOnboardingPermissionStatuses();
    if (mountedRef.current) {
      setStatuses(next.statuses);
      setCanAsk(next.canAsk);
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
              일부 권한을 꺼도 시작할 수 있어요. “위치(항상 허용)”는 휴대폰 설정 &gt; 위치에서 “항상”으로 바꿔야 할 수 있어요.
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
