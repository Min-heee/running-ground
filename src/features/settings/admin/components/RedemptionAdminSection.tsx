import { memo, useCallback } from 'react';
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
  StatusBadge,
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

const redemptionKeyExtractor = (item: AdminRewardRedemption) => item.id;

function getRedemptionBadgeTone(status: AdminRewardRedemption['status']) {
  if (status === 'fulfilled') {
    return 'success';
  }

  if (status === 'cancelled') {
    return 'muted';
  }

  return 'neutral';
}

const RedemptionRow = memo(function RedemptionRow({
  item,
  note,
  onChangeNote,
  onUpdate,
  submitting,
}: {
  item: AdminRewardRedemption;
  note: string;
  onChangeNote: (id: string, value: string) => void;
  onUpdate: (item: AdminRewardRedemption, status: AdminRewardRedemption['status']) => void;
  submitting: boolean;
}) {
  const handleNoteChange = useCallback((value: string) => onChangeNote(item.id, value), [item.id, onChangeNote]);
  const handleRequested = useCallback(() => onUpdate(item, 'requested'), [item, onUpdate]);
  const handleFulfilled = useCallback(() => onUpdate(item, 'fulfilled'), [item, onUpdate]);
  const handleCancelled = useCallback(() => onUpdate(item, 'cancelled'), [item, onUpdate]);

  return (
    <View style={styles.listCard}>
      <View style={styles.listHeader}>
        <View style={styles.listHeaderTextWrap}>
          <Text style={styles.listTitle}>{item.itemTitle}</Text>
          <Text style={styles.listMeta}>
            {item.userName}{item.userTag ? ` · ${item.userTag}` : ''} · {item.costPoints}P
          </Text>
        </View>
        <StatusBadge label={getRewardStatusLabel(item.status)} tone={getRedemptionBadgeTone(item.status)} />
      </View>
      <Text style={styles.listInfo}>신청 {formatDateTime(item.claimedAt)}</Text>
      {item.fulfilledAt ? <Text style={styles.listInfo}>처리 완료 {formatDateTime(item.fulfilledAt)}</Text> : null}
      <Field
        label="관리 메모"
        value={note}
        onChangeText={handleNoteChange}
        placeholder="발송 예정일, 취소 사유, 확인 메모를 남겨둘 수 있어요."
        multiline
      />
      <View style={styles.inlineActions}>
        <ActionButton label="요청됨" variant="secondary" onPress={handleRequested} disabled={submitting} />
        <ActionButton label="처리 완료" onPress={handleFulfilled} disabled={submitting} />
        <ActionButton label="취소" variant="danger" onPress={handleCancelled} disabled={submitting} />
      </View>
    </View>
  );
});

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
  const handleAllFilter = useCallback(() => setRedemptionFilter('all'), [setRedemptionFilter]);
  const handleRequestedFilter = useCallback(() => setRedemptionFilter('requested'), [setRedemptionFilter]);
  const handleFulfilledFilter = useCallback(() => setRedemptionFilter('fulfilled'), [setRedemptionFilter]);
  const handleCancelledFilter = useCallback(() => setRedemptionFilter('cancelled'), [setRedemptionFilter]);
  const handleChangeNote = useCallback((id: string, value: string) => {
    setRedemptionNotesById((current) => ({ ...current, [id]: value }));
  }, [setRedemptionNotesById]);
  const renderRedemption = useCallback((item: AdminRewardRedemption) => (
    <RedemptionRow
      item={item}
      note={redemptionNotesById[item.id] ?? ''}
      onChangeNote={handleChangeNote}
      onUpdate={handleUpdateRedemption}
      submitting={submitting}
    />
  ), [handleChangeNote, handleUpdateRedemption, redemptionNotesById, submitting]);

  return (
    <Card>
      <Text style={styles.sectionTitle}>교환 관리</Text>
      <Text style={styles.sectionDescription}>누가 어떤 리워드를 신청했는지 보고, 발송 완료나 취소 상태를 바로 관리해요.</Text>
      <View style={styles.listControls}>
        <SearchInput value={redemptionQuery} onChangeText={setRedemptionQuery} placeholder="회원명, 태그, 상품명으로 검색" />
        <View style={styles.toggleRow}>
          <ToggleChip label="전체" active={redemptionFilter === 'all'} onPress={handleAllFilter} />
          <ToggleChip label="요청됨" active={redemptionFilter === 'requested'} onPress={handleRequestedFilter} />
          <ToggleChip label="처리 완료" active={redemptionFilter === 'fulfilled'} onPress={handleFulfilledFilter} />
          <ToggleChip label="취소" active={redemptionFilter === 'cancelled'} onPress={handleCancelledFilter} />
        </View>
        <Text style={styles.filterSummary}>검색 결과 {filteredRewardRedemptions.length} / 전체 {rewardRedemptions.length}</Text>
      </View>
      <AdminList
        data={filteredRewardRedemptions}
        emptyText="아직 들어온 리워드 교환 요청이 없어요."
        keyExtractor={redemptionKeyExtractor}
        renderItem={renderRedemption}
      />
    </Card>
  );
}
