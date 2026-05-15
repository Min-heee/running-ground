import { memo, useCallback, useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Text, View } from 'react-native';
import { Card } from '@/components/Card';
import type { AdminNotice } from '@/lib/api/types';
import type { NoticeFormState } from '@/features/settings/admin/types';
import {
  createEmptyNoticeForm,
  formatDateTime,
  toNoticeForm,
} from '@/features/settings/admin/utils/adminDashboardUtils';
import {
  ActionButton,
  AdminList,
  Field,
  FormGrid,
  SearchInput,
  ToggleChip,
} from './AdminPrimitives';
import { styles } from './adminStyles';

type NoticeFilter = 'all' | 'active' | 'inactive';

type NoticeAdminSectionProps = {
  editingNoticeId: string | null;
  filteredNotices: AdminNotice[];
  handleDeleteNotice: (notice: AdminNotice) => void;
  handleSubmitNotice: () => void;
  loading: boolean;
  noticeFilter: NoticeFilter;
  noticeForm: NoticeFormState;
  noticeQuery: string;
  notices: AdminNotice[];
  setEditingNoticeId: Dispatch<SetStateAction<string | null>>;
  setNoticeFilter: Dispatch<SetStateAction<NoticeFilter>>;
  setNoticeForm: Dispatch<SetStateAction<NoticeFormState>>;
  setNoticeQuery: Dispatch<SetStateAction<string>>;
  submitting: boolean;
};

const noticeKeyExtractor = (notice: AdminNotice) => notice.id;

type NoticeFormTextField = Exclude<keyof NoticeFormState, 'isActive'>;
type NoticeFormFieldHandlers = Record<NoticeFormTextField, (value: string) => void>;

const NoticeRow = memo(function NoticeRow({
  notice,
  onDelete,
  onEdit,
  submitting,
}: {
  notice: AdminNotice;
  onDelete: (notice: AdminNotice) => void;
  onEdit: (notice: AdminNotice) => void;
  submitting: boolean;
}) {
  const handleEdit = useCallback(() => onEdit(notice), [notice, onEdit]);
  const handleDelete = useCallback(() => onDelete(notice), [notice, onDelete]);

  return (
    <View style={styles.listCard}>
      <View style={styles.listHeader}>
        <View style={styles.listHeaderTextWrap}>
          <Text style={styles.listTitle}>{notice.title}</Text>
          <Text style={styles.listMeta}>우선순위 {notice.priority} · {notice.isActive ? '활성' : '비활성'}</Text>
        </View>
        <View style={styles.inlineActions}>
          <ActionButton label="편집" variant="secondary" onPress={handleEdit} disabled={submitting} />
          <ActionButton label="삭제" variant="danger" onPress={handleDelete} disabled={submitting} />
        </View>
      </View>
      <Text style={styles.listInfo}>{notice.message}</Text>
      <Text style={styles.listInfo}>수정 {formatDateTime(notice.updatedAt)}</Text>
    </View>
  );
});

export function NoticeAdminSection({
  editingNoticeId,
  filteredNotices,
  handleDeleteNotice,
  handleSubmitNotice,
  loading,
  noticeFilter,
  noticeForm,
  noticeQuery,
  notices,
  setEditingNoticeId,
  setNoticeFilter,
  setNoticeForm,
  setNoticeQuery,
  submitting,
}: NoticeAdminSectionProps) {
  const noticeFormHandlers = useMemo<NoticeFormFieldHandlers>(() => ({
    title: (value) => setNoticeForm((current) => ({ ...current, title: value })),
    message: (value) => setNoticeForm((current) => ({ ...current, message: value })),
    priority: (value) => setNoticeForm((current) => ({ ...current, priority: value })),
  }), [setNoticeForm]);
  const handleActiveTrue = useCallback(() => setNoticeForm((current) => ({ ...current, isActive: true })), [setNoticeForm]);
  const handleActiveFalse = useCallback(() => setNoticeForm((current) => ({ ...current, isActive: false })), [setNoticeForm]);
  const handleCancelEdit = useCallback(() => {
    setEditingNoticeId(null);
    setNoticeForm(createEmptyNoticeForm());
  }, [setEditingNoticeId, setNoticeForm]);
  const handleAllFilter = useCallback(() => setNoticeFilter('all'), [setNoticeFilter]);
  const handleActiveFilter = useCallback(() => setNoticeFilter('active'), [setNoticeFilter]);
  const handleInactiveFilter = useCallback(() => setNoticeFilter('inactive'), [setNoticeFilter]);
  const handleEditNotice = useCallback((notice: AdminNotice) => {
    setEditingNoticeId(notice.id);
    setNoticeForm(toNoticeForm(notice));
  }, [setEditingNoticeId, setNoticeForm]);
  const renderNotice = useCallback((notice: AdminNotice) => (
    <NoticeRow
      notice={notice}
      onDelete={handleDeleteNotice}
      onEdit={handleEditNotice}
      submitting={submitting}
    />
  ), [handleDeleteNotice, handleEditNotice, submitting]);

  return (
    <Card>
      <Text style={styles.sectionTitle}>공지 관리</Text>
      <Text style={styles.sectionDescription}>운영 공지를 올리면 홈 화면 상단에 바로 노출돼요.</Text>
      <FormGrid>
        <Field
          label="공지 제목"
          value={noticeForm.title}
          onChangeText={noticeFormHandlers.title}
          placeholder="이번 주 레이스 접수 시작"
        />
        <Field
          label="공지 내용"
          value={noticeForm.message}
          onChangeText={noticeFormHandlers.message}
          placeholder="홈 상단에 보여줄 짧고 명확한 안내를 적어주세요."
          multiline
        />
        <Field
          label="우선순위"
          value={noticeForm.priority}
          onChangeText={noticeFormHandlers.priority}
          placeholder="0"
        />
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>활성 상태</Text>
          <View style={styles.toggleRow}>
            <ToggleChip label="활성" active={noticeForm.isActive} onPress={handleActiveTrue} />
            <ToggleChip label="비활성" active={!noticeForm.isActive} onPress={handleActiveFalse} />
          </View>
        </View>
      </FormGrid>
      <View style={styles.actionRow}>
        <ActionButton
          label={editingNoticeId ? '공지 수정 저장' : '공지 추가'}
          onPress={handleSubmitNotice}
          disabled={submitting || loading}
        />
        {editingNoticeId ? (
          <ActionButton
            label="취소"
            variant="secondary"
            onPress={handleCancelEdit}
            disabled={submitting}
          />
        ) : null}
      </View>
      <View style={styles.listControls}>
        <SearchInput value={noticeQuery} onChangeText={setNoticeQuery} placeholder="공지 제목이나 내용을 검색해보세요." />
        <View style={styles.toggleRow}>
          <ToggleChip label="전체" active={noticeFilter === 'all'} onPress={handleAllFilter} />
          <ToggleChip label="활성" active={noticeFilter === 'active'} onPress={handleActiveFilter} />
          <ToggleChip label="비활성" active={noticeFilter === 'inactive'} onPress={handleInactiveFilter} />
        </View>
        <Text style={styles.filterSummary}>검색 결과 {filteredNotices.length} / 전체 {notices.length}</Text>
      </View>
      <AdminList
        data={filteredNotices}
        emptyText="등록된 공지가 아직 없어요."
        keyExtractor={noticeKeyExtractor}
        renderItem={renderNotice}
      />
    </Card>
  );
}
