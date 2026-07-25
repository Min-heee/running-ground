import { useMemo, useState } from 'react';
import { FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import {
  buildGuidedSteps,
  getGuidedAppById,
  getGuidedAppsForPlatform,
  getGuidedImportSourceFilter,
  getHubLabel,
  type GuidedAppIcon,
  type GuidedAppId,
  type GuidedPlatform,
  type GuidedStep,
} from '@/features/integrations/guidedConnect/guidedConnectModel';
import {
  requestNativeHealthReadPermission,
  type NativeHealthSourceFilter,
} from '@/integrations/nativeHealth';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';

type PermissionPhase = 'idle' | 'requesting' | 'done' | 'error';

// White-on-transparent glyph PNGs, recolored at render time via tintColor —
// brands the bundled icon fonts don't carry (see GuidedAppIcon).
const BRAND_IMAGE_ASSETS = {
  nike: require('../../../../assets/branding/brand-nike.png'),
  garmin: require('../../../../assets/branding/brand-garmin.png'),
} as const;

const BRAND_ICON_SIZE = 15;

function BrandMark({ icon, fallbackColor }: { icon: GuidedAppIcon; fallbackColor: string }) {
  if (icon.kind === 'fa5') {
    return <FontAwesome5 name={icon.name} brand size={BRAND_ICON_SIZE} color={icon.color ?? fallbackColor} />;
  }

  if (icon.kind === 'mci') {
    return <MaterialCommunityIcons name={icon.name as never} size={BRAND_ICON_SIZE + 1} color={icon.color ?? fallbackColor} />;
  }

  return (
    <Image
      source={BRAND_IMAGE_ASSETS[icon.asset]}
      style={{ width: BRAND_ICON_SIZE, height: BRAND_ICON_SIZE, tintColor: icon.tint ?? fallbackColor }}
      resizeMode="contain"
    />
  );
}

type GuidedConnectCardProps = {
  platform: GuidedPlatform;
  deviceImporting: boolean;
  // Imports ONLY the selected app's hub records (guided step 3).
  onImportForApp: (sourceFilter: NativeHealthSourceFilter) => void;
};

// The "어떤 앱으로 달리세요?" guided wizard: pick the app you actually run with →
// that app's exact route-to-hub menu path (+ open button) → our read-permission
// prompt → import. Presentation only — the import mechanism is the same
// platform-hub read the screen always used.
export function GuidedConnectCard({
  platform,
  deviceImporting,
  onImportForApp,
}: GuidedConnectCardProps) {
  const apps = useMemo(() => getGuidedAppsForPlatform(platform), [platform]);
  const [selectedAppId, setSelectedAppId] = useState<GuidedAppId | null>(null);
  const [permissionPhase, setPermissionPhase] = useState<PermissionPhase>('idle');
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const steps = useMemo(
    () => (selectedAppId ? buildGuidedSteps(selectedAppId, platform) : []),
    [platform, selectedAppId],
  );

  const handleSelectApp = (appId: GuidedAppId) => {
    setSelectedAppId((current) => (current === appId ? null : appId));
  };

  const handleOpenApp = (step: GuidedStep) => {
    const fallback = () => {
      if (step.storeUrl) {
        Linking.openURL(step.storeUrl).catch(() => undefined);
      }
    };

    if (step.appScheme) {
      // openURL rejects when the app is missing → fall through to the store page
      // (which shows '열기' when the app is actually installed).
      Linking.openURL(step.appScheme).catch(fallback);
      return;
    }

    fallback();
  };

  const handleRequestPermission = async () => {
    if (permissionPhase === 'requesting') {
      return;
    }

    setPermissionPhase('requesting');
    setPermissionError(null);

    try {
      await requestNativeHealthReadPermission();
      setPermissionPhase('done');
    } catch (error) {
      setPermissionPhase('error');
      setPermissionError(error instanceof Error ? error.message : '권한 요청에 실패했어요.');
    }
  };

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>어떤 앱으로 달리세요?</Text>

      <View style={styles.chipRow}>
        {apps.map((app) => {
          const selected = app.id === selectedAppId;
          return (
            <Pressable
              key={app.id}
              onPress={() => handleSelectApp(app.id)}
              style={[styles.chip, selected && styles.chipSelected]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <BrandMark
                icon={app.icon}
                fallbackColor={selected ? colors.brand : colors.textPrimary}
              />
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {app.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {selectedAppId ? (
        <View style={styles.stepList}>
          {steps.map((step) => (
            <View key={step.key} style={styles.stepRow}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>{step.number}</Text>
              </View>
              <View style={styles.stepBody}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDescription}>{step.description}</Text>

                {step.key === 'route' && step.menuPathText ? (
                  <>
                    <Text style={styles.menuPath}>{step.menuPathText}</Text>
                    {step.fallbackNote ? (
                      <Text style={styles.fallbackNote}>{step.fallbackNote}</Text>
                    ) : null}
                    <Pressable style={styles.stepButton} onPress={() => handleOpenApp(step)}>
                      <Text style={styles.stepButtonText}>{step.openLabel ?? '앱 열기'}</Text>
                    </Pressable>
                  </>
                ) : null}

                {step.key === 'permission' ? (
                  <>
                    <Pressable
                      style={[styles.stepButton, permissionPhase === 'done' && styles.stepButtonDone]}
                      onPress={handleRequestPermission}
                      disabled={permissionPhase === 'requesting'}
                    >
                      <Text style={styles.stepButtonText}>
                        {permissionPhase === 'requesting'
                          ? '요청 중...'
                          : permissionPhase === 'done'
                            ? '✓ 요청 완료'
                            : `${getHubLabel(platform)} 읽기 허용하기`}
                      </Text>
                    </Pressable>
                    {permissionPhase === 'done' ? (
                      <Text style={styles.stepHint}>팝업에서 허용했다면 준비 끝이에요!</Text>
                    ) : null}
                    {permissionError ? <Text style={styles.stepError}>{permissionError}</Text> : null}
                  </>
                ) : null}

                {step.key === 'import' && selectedAppId ? (
                  <Pressable
                    style={[styles.stepButton, styles.importButton]}
                    onPress={() => onImportForApp(getGuidedImportSourceFilter(selectedAppId))}
                    disabled={deviceImporting}
                  >
                    <Text style={styles.importButtonText}>
                      {deviceImporting
                        ? '기록 가져오는 중...'
                        : `${getGuidedAppById(selectedAppId)?.label ?? '선택한 앱'} 기록 가져오기`}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.s12,
  },
  title: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    color: colors.textPrimary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxl,
  },
  chip: {
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtleAlt,
    borderColor: colors.borderMuted,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.lg,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s10,
  },
  chipSelected: {
    backgroundColor: colors.brandWash,
    borderColor: colors.brand,
  },
  chipText: {
    color: colors.textPrimary,
    fontWeight: fontWeights.bold,
    fontSize: fontSizes.sm,
  },
  chipTextSelected: {
    color: colors.brand,
  },
  stepList: {
    gap: spacing.s14,
    marginTop: spacing.sm,
  },
  stepRow: {
    flexDirection: 'row',
    gap: spacing.s12,
  },
  stepBadge: {
    alignItems: 'center',
    backgroundColor: colors.brandWash,
    borderRadius: radii.pill,
    height: 26,
    justifyContent: 'center',
    marginTop: 1,
    width: 26,
  },
  stepBadgeText: {
    color: colors.brand,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.sm,
  },
  stepBody: {
    flex: 1,
    gap: spacing.lg,
  },
  stepTitle: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.rank,
  },
  stepDescription: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  menuPath: {
    backgroundColor: colors.surfaceSubtleAlt,
    borderRadius: radii.md,
    color: colors.textPrimary,
    fontWeight: fontWeights.semibold,
    lineHeight: 20,
    overflow: 'hidden',
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s10,
  },
  stepButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.brandLighter,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s10,
  },
  stepButtonDone: {
    borderColor: colors.successText,
  },
  stepButtonText: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.sm,
  },
  importButton: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  importButtonText: {
    color: colors.white,
    fontWeight: fontWeights.extraBold,
    fontSize: fontSizes.sm,
  },
  fallbackNote: {
    color: colors.textTertiary,
    fontSize: fontSizes.sm,
    lineHeight: 18,
  },
  stepHint: {
    color: colors.successText,
    fontWeight: fontWeights.bold,
    lineHeight: 19,
  },
  stepError: {
    color: colors.danger,
    fontWeight: fontWeights.bold,
    lineHeight: 19,
  },
});
