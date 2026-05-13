import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';

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
    gap: 12,
  },
  sectionLink: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
  },
  dangerCard: {
    gap: 10,
  },
  accountActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  logoutButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    flex: 1,
  },
  logoutButtonText: {
    color: '#111827',
    fontWeight: '800',
  },
  deleteButton: {
    backgroundColor: '#FFF1F3',
    borderWidth: 1,
    borderColor: '#FDA29B',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    flex: 1,
  },
  deleteButtonText: {
    color: '#D92D20',
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.6,
  },
});
