import { useMemo, useState } from 'react';
import {
  createAdminNotice,
  deleteAdminNotice,
  updateAdminNotice,
} from '@/services/adminService';
import type { AdminNotice } from '@/lib/api/types';
import type { AdminDashboardDomainContext, NoticeFormState } from '@/features/settings/admin/types';
import {
  confirmAction,
  createEmptyNoticeForm,
  filterAdminNotices,
} from '@/features/settings/admin/utils/adminDashboardUtils';

// Notices domain slice of the admin dashboard. State + handlers only; loading the
// initial list stays in the useAdminDashboard composer (setNotices is exposed for it).
export function useAdminNotices({ adminToken, withSubmission, refreshOverview, setMessage }: AdminDashboardDomainContext) {
  const [notices, setNotices] = useState<AdminNotice[]>([]);
  const [noticeForm, setNoticeForm] = useState<NoticeFormState>(createEmptyNoticeForm);
  const [editingNoticeId, setEditingNoticeId] = useState<string | null>(null);
  const [noticeQuery, setNoticeQuery] = useState('');
  const [noticeFilter, setNoticeFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const handleSubmitNotice = () => {
    void withSubmission(async () => {
      const payload = {
        title: noticeForm.title,
        message: noticeForm.message,
        priority: Number(noticeForm.priority),
        isActive: noticeForm.isActive,
      };

      const result = editingNoticeId
        ? await updateAdminNotice(adminToken, editingNoticeId, payload)
        : await createAdminNotice(adminToken, payload);

      setNotices(result.items);
      setEditingNoticeId(null);
      setNoticeForm(createEmptyNoticeForm());
      await refreshOverview(adminToken);
      setMessage(editingNoticeId ? '공지를 수정했어요.' : '공지를 추가했어요.');
    });
  };

  const handleDeleteNotice = (notice: AdminNotice) => {
    if (!confirmAction(`${notice.title} 공지를 삭제할까요?`)) {
      return;
    }

    void withSubmission(async () => {
      const result = await deleteAdminNotice(adminToken, notice.id);
      setNotices(result.items);
      if (editingNoticeId === notice.id) {
        setEditingNoticeId(null);
        setNoticeForm(createEmptyNoticeForm());
      }
      await refreshOverview(adminToken);
      setMessage(`${notice.title} 공지를 삭제했어요.`);
    });
  };

  const filteredNotices = useMemo(
    () => filterAdminNotices(notices, noticeQuery, noticeFilter),
    [noticeFilter, noticeQuery, notices],
  );

  return {
    editingNoticeId,
    filteredNotices,
    handleDeleteNotice,
    handleSubmitNotice,
    noticeFilter,
    noticeForm,
    noticeQuery,
    notices,
    setEditingNoticeId,
    setNoticeFilter,
    setNoticeForm,
    setNoticeQuery,
    setNotices,
  };
}
