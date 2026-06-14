import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { AppState, Linking, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import {
  getOnboardingPermissionStatuses,
  ONBOARDING_PERMISSION_DENIED,
  requestAllOnboardingPermissions,
  type OnboardingPermissionKey,
  type OnboardingPermissionStatuses,
} from '@/features/auth/onboarding/onboardingPermissions';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type TourStep = 'welcome' | 'permissions' | 'connect';

const STEP_ORDER: TourStep[] = ['welcome', 'permissions', 'connect'];

const PERMISSION_ITEMS: { key: OnboardingPermissionKey; label: string; hint: string }[] = [
  { key: 'location', label: '위치 (사용 중)', hint: 'GPS로 러닝 경로·거리·페이스를 측정해요.' },
  { key: 'backgroundLocation', label: '위치 (항상 허용)', hint: '화면을 꺼도 대결 측정이 끊기지 않아요.' },
  { key: 'notifications', label: '알림', hint: '대결 시작·중간 차이를 알려줘요.' },
];

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
}: {
  label: string;
  hint: string;
  granted: boolean;
}) {
  return (
    <View style={styles.permissionRow}>
      <View style={styles.permissionCopy}>
        <Text style={styles.permissionLabel}>{label}</Text>
        <Text style={styles.permissionHint}>{hint}</Text>
      </View>
      <Text style={[styles.permissionBadge, granted ? styles.permissionBadgeOn : styles.permissionBadgeOff]}>
        {granted ? '✓ 허용됨' : '허용 필요'}
      </Text>
    </View>
  );
});

export default function WelcomeTourScreen() {
  const [step, setStep] = useState<TourStep>('welcome');
  const [statuses, setStatuses] = useState<OnboardingPermissionStatuses>(ONBOARDING_PERMISSION_DENIED);
  const [requesting, setRequesting] = useState(false);
  const [hasRequested, setHasRequested] = useState(false);

  const requestingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const activeIndex = STEP_ORDER.indexOf(step);
  const allGranted = statuses.location && statuses.backgroundLocation && statuses.notifications;

  // Skip while a request is in flight so the foreground-refresh and the request don't both
  // write statuses out of order (the request's result is the authoritative one).
  const refreshStatuses = useCallback(async () => {
    if (requestingRef.current) {
      return;
    }
    const next = await getOnboardingPermissionStatuses();
    if (mountedRef.current) {
      setStatuses(next);
    }
  }, []);

  // Re-check on mount and whenever the app returns to the foreground — covers the case
  // where the user grants a denied permission from the OS Settings app and comes back.
  useEffect(() => {
    void refreshStatuses();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshStatuses();
      }
    });
    return () => subscription.remove();
  }, [refreshStatuses]);

  const handleRequestPermissions = useCallback(async () => {
    requestingRef.current = true;
    setRequesting(true);
    try {
      const next = await requestAllOnboardingPermissions();
      if (mountedRef.current) {
        setStatuses(next);
        setHasRequested(true);
      }
    } finally {
      requestingRef.current = false;
      if (mountedRef.current) {
        setRequesting(false);
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
            <Text style={styles.title}>러닝이 경쟁이 되는 앱</Text>
            <Text style={styles.description}>
              혼자 뛰던 러닝을 친구·러너들과 1대1, 그룹 대결로 바꿔요. 시작하려면 몇 가지만 켜면 돼요.
            </Text>
          </View>
        ) : null}

        {step === 'permissions' ? (
          <View style={styles.heroCard}>
            <Text style={styles.kicker}>STEP 1 · 필수</Text>
            <Text style={styles.permissionTitle}>권한 허용</Text>
            <Text style={styles.permissionSubtitle}>
              러닝 측정엔 위치와 알림이 꼭 필요해요. 모두 허용해야 시작할 수 있어요.
            </Text>
            <View style={styles.permissionList}>
              {PERMISSION_ITEMS.map((item) => (
                <PermissionRow
                  key={item.key}
                  label={item.label}
                  hint={item.hint}
                  granted={statuses[item.key]}
                />
              ))}
            </View>
            {hasRequested && !allGranted ? (
              <Text style={styles.deniedHint}>
                꺼진 권한이 있어요. 특히 “위치(항상 허용)”는 휴대폰 설정 &gt; 위치에서 “항상”으로 바꿔야 할 수 있어요.
                설정에서 켜고 돌아오면 자동으로 확인돼요.
              </Text>
            ) : null}
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
            allGranted ? (
              <PrimaryButton label="다음" onPress={() => setStep('connect')} />
            ) : hasRequested ? (
              // After a denial the in-app prompt can't re-ask on iOS, so make 설정 열기 the
              // primary path; 다시 시도 stays as a secondary fallback (it can still re-prompt
              // on Android in some states).
              <>
                <PrimaryButton label="설정 열기" onPress={handleOpenSettings} />
                <SecondaryButton
                  label={requesting ? '확인 중...' : '다시 시도'}
                  onPress={handleRequestPermissions}
                  disabled={requesting}
                />
              </>
            ) : (
              <PrimaryButton
                label={requesting ? '요청 중...' : '권한 허용하기'}
                onPress={handleRequestPermissions}
                disabled={requesting}
              />
            )
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
  permissionBadge: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
    overflow: 'hidden',
  },
  permissionBadgeOn: {
    color: colors.green,
  },
  permissionBadgeOff: {
    color: colors.orange,
  },
  deniedHint: {
    color: colors.orange,
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
