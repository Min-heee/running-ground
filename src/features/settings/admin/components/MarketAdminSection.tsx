import type { Dispatch, SetStateAction } from 'react';
import { Text, View } from 'react-native';
import { Card } from '@/components/Card';
import type { AdminMarketItem } from '@/lib/api/types';
import type { MarketFormState } from '@/features/settings/admin/types';
import {
  createEmptyMarketForm,
  toMarketForm,
} from '@/features/settings/admin/utils/adminDashboardUtils';
import {
  ActionButton,
  AdminList,
  Field,
  SearchInput,
  ToggleChip,
} from './AdminPrimitives';
import { styles } from './adminStyles';

type MarketFilter = 'all' | 'active' | 'inactive';

type MarketAdminSectionProps = {
  editingMarketItemId: string | null;
  filteredMarketItems: AdminMarketItem[];
  handleDeleteMarket: (item: AdminMarketItem) => void;
  handleSubmitMarket: () => void;
  isMedium: boolean;
  loading: boolean;
  marketFilter: MarketFilter;
  marketForm: MarketFormState;
  marketItems: AdminMarketItem[];
  marketQuery: string;
  setEditingMarketItemId: Dispatch<SetStateAction<string | null>>;
  setMarketFilter: Dispatch<SetStateAction<MarketFilter>>;
  setMarketForm: Dispatch<SetStateAction<MarketFormState>>;
  setMarketQuery: Dispatch<SetStateAction<string>>;
  submitting: boolean;
};

export function MarketAdminSection({
  editingMarketItemId,
  filteredMarketItems,
  handleDeleteMarket,
  handleSubmitMarket,
  isMedium,
  loading,
  marketFilter,
  marketForm,
  marketItems,
  marketQuery,
  setEditingMarketItemId,
  setMarketFilter,
  setMarketForm,
  setMarketQuery,
  submitting,
}: MarketAdminSectionProps) {
  return (
    <Card>
      <Text style={styles.sectionTitle}>마켓 관리</Text>
      <Text style={styles.sectionDescription}>상품 추가, 수정, 비활성화, 재고 관리를 여기서 바로 처리해요.</Text>
      <View style={[styles.formGrid, isMedium ? styles.formGridTwoColumns : null]}>
        <Field label="상품명" value={marketForm.title} onChangeText={(value) => setMarketForm((current) => ({ ...current, title: value }))} />
        <Field label="카테고리" value={marketForm.category} onChangeText={(value) => setMarketForm((current) => ({ ...current, category: value }))} />
        <View style={styles.formGridFull}>
          <Field
            label="설명"
            value={marketForm.description}
            onChangeText={(value) => setMarketForm((current) => ({ ...current, description: value }))}
            multiline
          />
        </View>
        <Field label="필요 포인트" value={marketForm.costPoints} onChangeText={(value) => setMarketForm((current) => ({ ...current, costPoints: value }))} placeholder="60" />
        <Field label="파트너명" value={marketForm.partnerName} onChangeText={(value) => setMarketForm((current) => ({ ...current, partnerName: value }))} placeholder="메가커피" />
        <Field label="재고 수량" value={marketForm.inventoryCount} onChangeText={(value) => setMarketForm((current) => ({ ...current, inventoryCount: value }))} placeholder="비우면 무제한" />
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>반복 교환</Text>
          <View style={styles.toggleRow}>
            <ToggleChip label="1회만" active={!marketForm.repeatable} onPress={() => setMarketForm((current) => ({ ...current, repeatable: false }))} />
            <ToggleChip label="반복 가능" active={marketForm.repeatable} onPress={() => setMarketForm((current) => ({ ...current, repeatable: true }))} />
          </View>
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>활성 상태</Text>
          <View style={styles.toggleRow}>
            <ToggleChip label="활성" active={marketForm.isActive} onPress={() => setMarketForm((current) => ({ ...current, isActive: true }))} />
            <ToggleChip label="비활성" active={!marketForm.isActive} onPress={() => setMarketForm((current) => ({ ...current, isActive: false }))} />
          </View>
        </View>
      </View>
      <View style={styles.actionRow}>
        <ActionButton
          label={editingMarketItemId ? '상품 수정 저장' : '상품 추가'}
          onPress={handleSubmitMarket}
          disabled={submitting || loading}
        />
        {editingMarketItemId ? (
          <ActionButton
            label="취소"
            variant="secondary"
            onPress={() => {
              setEditingMarketItemId(null);
              setMarketForm(createEmptyMarketForm());
            }}
            disabled={submitting}
          />
        ) : null}
      </View>
      <View style={styles.listControls}>
        <SearchInput value={marketQuery} onChangeText={setMarketQuery} placeholder="상품명, 카테고리, 파트너명으로 검색" />
        <View style={styles.toggleRow}>
          <ToggleChip label="전체" active={marketFilter === 'all'} onPress={() => setMarketFilter('all')} />
          <ToggleChip label="활성" active={marketFilter === 'active'} onPress={() => setMarketFilter('active')} />
          <ToggleChip label="비활성" active={marketFilter === 'inactive'} onPress={() => setMarketFilter('inactive')} />
        </View>
        <Text style={styles.filterSummary}>검색 결과 {filteredMarketItems.length} / 전체 {marketItems.length}</Text>
      </View>
      <AdminList
        data={filteredMarketItems}
        emptyText="등록된 마켓 상품이 아직 없어요."
        keyExtractor={(item) => item.id}
        renderItem={(item) => (
          <View style={styles.listCard}>
            <View style={styles.listHeader}>
              <View style={styles.listHeaderTextWrap}>
                <Text style={styles.listTitle}>{item.title}</Text>
                <Text style={styles.listMeta}>{item.category} · {item.costPoints}P</Text>
              </View>
              <View style={styles.inlineActions}>
                <ActionButton label="편집" variant="secondary" onPress={() => {
                  setEditingMarketItemId(item.id);
                  setMarketForm(toMarketForm(item));
                }} disabled={submitting} />
                <ActionButton label="삭제" variant="danger" onPress={() => handleDeleteMarket(item)} disabled={submitting} />
              </View>
            </View>
            <Text style={styles.listInfo}>{item.description}</Text>
            <Text style={styles.listInfo}>
              {item.partnerName ? `${item.partnerName} · ` : ''}
              {item.isActive ? '활성' : '비활성'} · {item.repeatable ? '반복 교환 가능' : '1회 교환'} · 재고 {item.remainingStock === null ? '무제한' : `${item.remainingStock}개`}
            </Text>
          </View>
        )}
      />
    </Card>
  );
}
