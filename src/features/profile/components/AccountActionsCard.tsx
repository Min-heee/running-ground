import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type AccountActionsCardProps = {
  logoutConfirm: boolean;
  deleteConfirm: boolean;
  logoutSubmitting: boolean;
  deleteSubmitting: boolean;
  onLogout: () => void;
  onDeleteAccount: () => void;
};

export function AccountActionsCard({
  logoutConfirm,
  deleteConfirm,
  logoutSubmitting,
  deleteSubmitting,
  onLogout,
  onDeleteAccount,
}: AccountActionsCardProps) {
  return (
    <Card style={styles.dangerCard}>
      <View style={styles.sectionHeaderRow}>
        <SectionTitle>계정</SectionTitle>
        <Text style={styles.sectionLink}>로그아웃 / 탈퇴</Text>
      </View>
      <View style={styles.accountActionRow}>
        <Pressable
          disabled={logoutSubmitting || deleteSubmitting}
          style={[
            styles.logoutButton,
            (logoutSubmitting || deleteSubmitting) ? styles.disabledButton : null,
          ]}
          onPress={onLogout}
        >
          <Text style={styles.logoutButtonText}>
            {logoutSubmitting ? '로그아웃 중...' : logoutConfirm ? '다시 누르면 로그아웃' : '로그아웃'}
          </Text>
        </Pressable>
        <Pressable
          disabled={deleteSubmitting || logoutSubmitting}
          style={[
            styles.deleteButton,
            (deleteSubmitting || logoutSubmitting) ? styles.disabledButton : null,
          ]}
          onPress={onDeleteAccount}
        >
          <Text style={styles.deleteButtonText}>
            {deleteSubmitting
              ? '탈퇴 처리 중...'
              : deleteConfirm
                ? '다시 누르면 탈퇴'
                : '회원 탈퇴'}
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s12,
  },
  sectionLink: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  dangerCard: {
    gap: spacing.s10,
  },
  accountActionRow: {
    flexDirection: 'row',
    gap: spacing.s10,
  },
  logoutButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing.s12,
    alignItems: 'center',
    flex: 1,
  },
  logoutButtonText: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
  },
  deleteButton: {
    backgroundColor: colors.roseWash,
    borderWidth: 1,
    borderColor: colors.dangerSalmon,
    borderRadius: radii.md,
    paddingVertical: spacing.s12,
    alignItems: 'center',
    flex: 1,
  },
  deleteButtonText: {
    color: colors.dangerBright,
    fontWeight: fontWeights.extraBold,
  },
  disabledButton: {
    opacity: 0.6,
  },
});
