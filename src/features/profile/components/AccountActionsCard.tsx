import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

type AccountActionsCardProps = {
  logoutConfirm: boolean;
  deleteConfirm: boolean;
  logoutSubmitting: boolean;
  deleteSubmitting: boolean;
  onLogout: () => void;
  onDeleteAccount: () => void;
};

// 계정 카드 (오너 2026-09-18 '마이 정돈'): 흰 반쪽 + 분홍 반쪽이던 로그아웃/탈퇴를 바로 위 설정
// 카드와 **똑같은 행 문법**(gap 0, 모든 행 위 헤어라인, bold 라벨, paddingVertical 12)의 세로 두 줄로.
// 탈퇴는 빨간 글씨만 — 채움도 테두리도 없다. 두 번 눌러 확정하는 흐름과 문구는 그대로다.
export function AccountActionsCard({
  logoutConfirm,
  deleteConfirm,
  logoutSubmitting,
  deleteSubmitting,
  onLogout,
  onDeleteAccount,
}: AccountActionsCardProps) {
  const busy = logoutSubmitting || deleteSubmitting;

  return (
    <Card style={styles.card}>
      <SectionTitle>계정</SectionTitle>
      <View>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          style={[styles.row, busy ? styles.rowDisabled : null]}
          hitSlop={{ top: 2, bottom: 2 }}
          onPress={onLogout}
        >
          <Text style={styles.rowText}>
            {logoutSubmitting ? '로그아웃 중...' : logoutConfirm ? '다시 누르면 로그아웃' : '로그아웃'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          style={[styles.row, busy ? styles.rowDisabled : null]}
          hitSlop={{ top: 2, bottom: 2 }}
          onPress={onDeleteAccount}
        >
          <Text style={styles.rowDangerText}>
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
  // ProfileSettingsCard.settingsCard / settingRow / settingLabel 과 값이 같아야 두 카드가 한 결로 선다.
  card: {
    gap: 0,
  },
  row: {
    paddingVertical: spacing.s12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
  },
  rowDisabled: {
    opacity: 0.6,
  },
  rowText: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  rowDangerText: {
    color: colors.danger,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
});
