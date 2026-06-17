import type { Dispatch, SetStateAction } from 'react';
import { Text, View } from 'react-native';
import { Card } from '@/components/Card';
import type { AdminUserSummary } from '@/lib/api/types';
import {
  ActionButton,
  AdminList,
  SearchInput,
} from './AdminPrimitives';
import { styles } from './adminStyles';

type UserAdminSectionProps = {
  filteredUsers: AdminUserSummary[];
  handleDeleteUser: (user: AdminUserSummary) => void;
  setUserQuery: Dispatch<SetStateAction<string>>;
  submitting: boolean;
  userQuery: string;
  users: AdminUserSummary[];
};

export function UserAdminSection({
  filteredUsers,
  handleDeleteUser,
  setUserQuery,
  submitting,
  userQuery,
  users,
}: UserAdminSectionProps) {
  return (
    <Card>
      <Text style={styles.sectionTitle}>회원 관리</Text>
      <Text style={styles.sectionDescription}>가입한 회원과 지역, 활동량을 보고 바로 정리할 수 있어요.</Text>
      <View style={styles.listControls}>
        <SearchInput value={userQuery} onChangeText={setUserQuery} placeholder="이름, 아이디, 태그, 지역으로 검색" />
        <Text style={styles.filterSummary}>검색 결과 {filteredUsers.length} / 전체 {users.length}</Text>
      </View>
      <AdminList
        data={filteredUsers}
        emptyText="아직 회원이 없어요."
        keyExtractor={(user) => user.id}
        renderItem={(user) => (
          <View style={styles.listCard}>
            <View style={styles.listHeader}>
              <View style={styles.listHeaderTextWrap}>
                <Text style={styles.listTitle}>{user.name}</Text>
                <Text style={styles.listMeta}>@{user.username} · {user.publicTag}</Text>
              </View>
              <ActionButton label="삭제" variant="danger" onPress={() => handleDeleteUser(user)} disabled={submitting} />
            </View>
            <Text style={styles.listInfo}>
              {user.provinceName ?? ''}{user.cityName ? ` ${user.cityName}` : ''} {user.districtName}
            </Text>
            <Text style={styles.listInfo}>
              누적 {user.lifetimeDistanceKm}km · 이번 주 {user.currentWeekDistanceKm}km / {user.currentWeekPoints}P · 연동 {user.connectedSourceCount}개
            </Text>
          </View>
        )}
      />
    </Card>
  );
}
