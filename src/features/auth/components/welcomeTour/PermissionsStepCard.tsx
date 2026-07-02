import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PermissionRow } from './PermissionRow';
import { tourCardStyles } from './tourCardStyles';
import { HEALTH_ITEM, PERMISSION_ITEMS } from './welcomeTourData';
import {
  requestHealthConnect,
  requestLocation,
  type OnboardingPermissionCanAsk,
  type OnboardingPermissionKey,
  type OnboardingPermissionStatuses,
} from '@/features/auth/onboarding/onboardingPermissions';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

export const PermissionsStepCard = memo(function PermissionsStepCard({
  statuses,
  canAsk,
  busyKey,
  batteryAvailable,
  batteryExempt,
  batteryBusy,
  onRunRequest,
  onRequestBattery,
  onOpenSettings,
}: {
  statuses: OnboardingPermissionStatuses;
  canAsk: OnboardingPermissionCanAsk;
  busyKey: OnboardingPermissionKey | null;
  batteryAvailable: boolean;
  batteryExempt: boolean;
  batteryBusy: boolean;
  onRunRequest: (key: OnboardingPermissionKey, request: () => Promise<boolean>) => Promise<void>;
  onRequestBattery: () => Promise<void>;
  onOpenSettings: () => void;
}) {
  return (
    <View style={tourCardStyles.heroCard}>
      <Text style={tourCardStyles.kicker}>STEP 1 · 권한</Text>
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
            void onRunRequest('backgroundLocation', requestLocation);
          }}
          onOpenSettings={onOpenSettings}
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
              void onRunRequest(item.key, item.request);
            }}
            onOpenSettings={onOpenSettings}
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
              void onRequestBattery();
            }}
            onOpenSettings={() => {
              void onRequestBattery();
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
            void onRunRequest('health', requestHealthConnect);
          }}
          onOpenSettings={onOpenSettings}
        />
      </View>
      <Text style={styles.deniedHint}>
        일부 권한을 꺼도 시작할 수 있어요. 위치 “항상 허용”은 휴대폰 설정 &gt; 위치에서 바꿔야 할 수 있어요.
        설정에서 켜고 돌아오면 자동으로 확인돼요.
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
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
  deniedHint: {
    color: colors.lavenderSoft,
    fontSize: fontSizes.xs,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
});
