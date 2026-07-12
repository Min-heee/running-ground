import { useMemo, useState } from 'react';
import { deleteAdminUser } from '@/services/adminService';
import type { AdminUserSummary } from '@/lib/api/types';
import type { AdminDashboardDomainContext } from '@/features/settings/admin/types';
import { confirmAction, filterAdminUsers } from '@/features/settings/admin/utils/adminDashboardUtils';

// Users domain slice of the admin dashboard. State + handlers only; loading the
// initial list stays in the useAdminDashboard composer (setUsers is exposed for it).
export function useAdminUsers({ adminToken, withSubmission, refreshOverview, setMessage }: AdminDashboardDomainContext) {
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [userQuery, setUserQuery] = useState('');

  const handleDeleteUser = (user: AdminUserSummary) => {
    if (!confirmAction(`${user.name} 회원을 삭제할까요? 이 작업은 되돌릴 수 없어요.`)) {
      return;
    }

    void withSubmission(async () => {
      const result = await deleteAdminUser(adminToken, user.id);
      setUsers(result.users);
      await refreshOverview(adminToken);
      setMessage(`${user.name} 회원을 삭제했어요.`);
    });
  };

  const filteredUsers = useMemo(() => filterAdminUsers(users, userQuery), [userQuery, users]);

  return {
    filteredUsers,
    handleDeleteUser,
    setUserQuery,
    setUsers,
    userQuery,
    users,
  };
}
