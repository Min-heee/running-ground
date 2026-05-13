import type { Dispatch, SetStateAction } from 'react';
import { Text, View } from 'react-native';
import { Card } from '@/components/Card';
import type { AdminRewardRedemption } from '@/lib/api/types';
import {
  formatDateTime,
  getRewardStatusLabel,
} from '@/features/settings/admin/utils/adminDashboardUtils';
import {
  ActionButton,
  AdminList,
  Field,
  SearchInput,
  ToggleChip,
} from './AdminPrimitives';
import { styles } from './adminStyles';

type RedemptionFilter = 'all' | 'requested' | 'fulfilled' | 'cancelled';

type RedemptionAdminSectionProps = {
  filteredRewardRedemptions: AdminRewardRedemption[];
  handleUpdateRedemption: (item: AdminRewardRedemption, status: AdminRewardRedemption['status']) => void;
  redemptionFilter: RedemptionFilter;
  redemptionNotesById: Record<string, string>;
  redemptionQuery: string;
  rewardRedemptions: AdminRewardRedemption[];
  setRedemptionFilter: Dispatch<SetStateAction<RedemptionFilter>>;
  setRedemptionNotesById: Dispatch<SetStateAction<Record<string, string>>>;
  setRedemptionQuery: Dispatch<SetStateAction<string>>;
  submitting: boolean;
};

export function RedemptionAdminSection({
  filteredRewardRedemptions,
  handleUpdateRedemption,
  redemptionFilter,
  redemptionNotesById,
  redemptionQuery,
  rewardRedemptions,
  setRedemptionFilter,
  setRedemptionNotesById,
  setRedemptionQuery,
  submitting,
}: RedemptionAdminSectionProps) {
  return (
    <Card>
      <Text style={styles.sectionTitle}>교환 관리</Text>
      <Text style={styles.sectionDescription}>누가 어떤 리워드를 신청했는지 보고, 발송 완료나 취소 상태를 바로 관리해요.</Text>
      <View style={styles.listControls}>
        <SearchInput value={redemptionQuery} onChangeText={setRedemptionQuery} placeholder="회원명, 태그, 상품명으로 검색" />
        <View style={styles.toggleRow}>
          <ToggleChip label="전체" active={redemptionFilter === 'all'} onPress={() => setRedemptionFilter('all')} />
          <ToggleChip label="요청됨" active={redemptionFilter === 'requested'} onPress={() => setRedemptionFilter('requested')} />
          <ToggleChip label="처리 완료" active={redemptionFilter === 'fulfilled'} onPress={() => setRedemptionFilter('fulfilled')} />
          <ToggleChip label="취소" active={redemptionFilter === 'cancelled'} onPress={() => setRedemptionFilter('cancelled')} />
        </View>
        <Text style={styles.filterSummary}>검색 결과 {filteredRewardRedemptions.length} / 전체 {rewardRedemptions.length}</Text>
      </View>
      <AdminList
        data={filteredRewardRedemptions}
        emptyText="아직 들어온 리워드 교환 요청이 없어요."
        keyExtractor={(item) => item.id}
        renderItem={(item) => (
          <View style={styles.listCard}>
            <View style={styles.listHeader}>
              <View style={styles.listHeaderTextWrap}>
                <Text style={styles.listTitle}>{item.itemTitle}</Text>
                <Text style={styles.listMeta}>
                  {item.userName}{item.userTag ? ` · ${item.userTag}` : ''} · {item.costPoints}P
                </Text>
              </View>
              <View style={[
                styles.statusBadge,
                item.status === 'fulfilled' ? styles.statusBadgeSuccess : null,
                item.status === 'cancelled' ? styles.statusBadgeMuted : null,
              ]}>
                <Text style={[
                  styles.statusBadgeText,
                  item.status === 'fulfilled' ? styles.statusBadgeTextSuccess : null,
                  item.status === 'cancelled' ? styles.statusBadgeTextMuted : null,
                ]}>
                  {getRewardStatusLabel(item.status)}
                </Text>
              </View>
            </View>
            <Text style={styles.listInfo}>신청 {formatDateTime(item.claimedAt)}</Text>
            {item.fulfilledAt ? <Text style={styles.listInfo}>처리 완료 {formatDateTime(item.fulfilledAt)}</Text> : null}
            <Field
              label="관리 메모"
              value={redemptionNotesById[item.id] ?? ''}
              onChangeText={(value) => setRedemptionNotesById((current) => ({ ...current, [item.id]: value }))}
              placeholder="발송 예정일, 취소 사유, 확인 메모를 남겨둘 수 있어요."
              multiline
            />
            <View style={styles.inlineActions}>
              <ActionButton label="요청됨" variant="secondary" onPress={() => handleUpdateRedemption(item, 'requested')} disabled={submitting} />
              <ActionButton label="처리 완료" onPress={() => handleUpdateRedemption(item, 'fulfilled')} disabled={submitting} />
              <ActionButton label="취소" variant="danger" onPress={() => handleUpdateRedemption(item, 'cancelled')} disabled={submitting} />
            </View>
          </View>
        )}
      />
    </Card>
  );
}
