import { useMemo, useState } from 'react';
import { updateAdminRewardRedemption } from '@/services/adminService';
import type { AdminRewardRedemption } from '@/lib/api/types';
import type { AdminDashboardDomainContext } from '@/features/settings/admin/types';
import {
  buildRedemptionNoteDrafts,
  filterAdminRewardRedemptions,
  getRewardStatusLabel,
} from '@/features/settings/admin/utils/adminDashboardUtils';

// Reward-redemptions domain slice of the admin dashboard. State + handlers only; loading
// the initial list stays in the useAdminDashboard composer (setRewardRedemptions /
// setRedemptionNotesById are exposed for it).
export function useAdminRedemptions({ adminToken, withSubmission, refreshOverview, setMessage }: AdminDashboardDomainContext) {
  const [rewardRedemptions, setRewardRedemptions] = useState<AdminRewardRedemption[]>([]);
  const [redemptionNotesById, setRedemptionNotesById] = useState<Record<string, string>>({});
  const [redemptionQuery, setRedemptionQuery] = useState('');
  const [redemptionFilter, setRedemptionFilter] = useState<'all' | 'requested' | 'fulfilled' | 'cancelled'>('all');

  const handleUpdateRedemption = (item: AdminRewardRedemption, status: AdminRewardRedemption['status']) => {
    void withSubmission(async () => {
      const result = await updateAdminRewardRedemption(adminToken, item.id, {
        status,
        adminNote: redemptionNotesById[item.id] ?? '',
      });

      setRewardRedemptions(result.items);
      setRedemptionNotesById(buildRedemptionNoteDrafts(result.items));
      await refreshOverview(adminToken);
      setMessage(`${item.userName}님의 교환 상태를 ${getRewardStatusLabel(status)}로 바꿨어요.`);
    });
  };

  const filteredRewardRedemptions = useMemo(
    () => filterAdminRewardRedemptions(rewardRedemptions, redemptionQuery, redemptionFilter),
    [redemptionFilter, redemptionQuery, rewardRedemptions],
  );

  return {
    filteredRewardRedemptions,
    handleUpdateRedemption,
    redemptionFilter,
    redemptionNotesById,
    redemptionQuery,
    rewardRedemptions,
    setRedemptionFilter,
    setRedemptionNotesById,
    setRedemptionQuery,
    setRewardRedemptions,
  };
}
