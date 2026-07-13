import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  resolvePermissionRowAction,
  type PermissionRowActionKind,
} from '@/features/auth/onboarding/permissionStepModel';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

export const PermissionRow = memo(function PermissionRow({
  label,
  hint,
  granted,
  canAsk,
  busy,
  required = false,
  noteText,
  onRequest,
  onOpenSettings,
}: {
  label: string;
  hint: string;
  granted: boolean;
  canAsk: boolean;
  busy: boolean;
  required?: boolean;
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
        {action !== 'granted' && !busy ? (
          required ? (
            <Text style={styles.permissionRequired}>필수</Text>
          ) : (
            <Text style={styles.permissionLater}>나중에 가능</Text>
          )
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
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
  permissionRequired: {
    color: colors.orange,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.extraBold,
  },
  permissionBadge: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
    overflow: 'hidden',
  },
  permissionBadgeOn: {
    color: colors.green,
  },
});
