import { useMemo, useState } from 'react';
import {
  createAdminMarketItem,
  deleteAdminMarketItem,
  updateAdminMarketItem,
} from '@/services/adminService';
import type { AdminMarketItem } from '@/lib/api/types';
import type { AdminDashboardDomainContext, MarketFormState } from '@/features/settings/admin/types';
import {
  confirmAction,
  createEmptyMarketForm,
  filterAdminMarketItems,
} from '@/features/settings/admin/utils/adminDashboardUtils';

// Market domain slice of the admin dashboard. State + handlers only; loading the
// initial list stays in the useAdminDashboard composer (setMarketItems is exposed for it).
export function useAdminMarket({ adminToken, withSubmission, refreshOverview, setMessage }: AdminDashboardDomainContext) {
  const [marketItems, setMarketItems] = useState<AdminMarketItem[]>([]);
  const [marketQuery, setMarketQuery] = useState('');
  const [marketFilter, setMarketFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [marketForm, setMarketForm] = useState<MarketFormState>(createEmptyMarketForm);
  const [editingMarketItemId, setEditingMarketItemId] = useState<string | null>(null);

  const handleSubmitMarket = () => {
    void withSubmission(async () => {
      const payload = {
        title: marketForm.title,
        category: marketForm.category,
        description: marketForm.description,
        costPoints: Number(marketForm.costPoints),
        partnerName: marketForm.partnerName.trim() || undefined,
        repeatable: marketForm.repeatable,
        isActive: marketForm.isActive,
        inventoryCount: marketForm.inventoryCount.trim() ? Number(marketForm.inventoryCount) : null,
      };

      const result = editingMarketItemId
        ? await updateAdminMarketItem(adminToken, editingMarketItemId, payload)
        : await createAdminMarketItem(adminToken, payload);

      setMarketItems(result.items);
      setEditingMarketItemId(null);
      setMarketForm(createEmptyMarketForm());
      await refreshOverview(adminToken);
      setMessage(editingMarketItemId ? '마켓 상품을 수정했어요.' : '마켓 상품을 추가했어요.');
    });
  };

  const handleDeleteMarket = (item: AdminMarketItem) => {
    if (!confirmAction(`${item.title} 상품을 삭제할까요?`)) {
      return;
    }

    void withSubmission(async () => {
      const result = await deleteAdminMarketItem(adminToken, item.id);
      setMarketItems(result.items);
      if (editingMarketItemId === item.id) {
        setEditingMarketItemId(null);
        setMarketForm(createEmptyMarketForm());
      }
      await refreshOverview(adminToken);
      setMessage(`${item.title} 상품을 삭제했어요.`);
    });
  };

  const filteredMarketItems = useMemo(
    () => filterAdminMarketItems(marketItems, marketQuery, marketFilter),
    [marketFilter, marketItems, marketQuery],
  );

  return {
    editingMarketItemId,
    filteredMarketItems,
    handleDeleteMarket,
    handleSubmitMarket,
    marketFilter,
    marketForm,
    marketItems,
    marketQuery,
    setEditingMarketItemId,
    setMarketFilter,
    setMarketForm,
    setMarketItems,
    setMarketQuery,
  };
}
