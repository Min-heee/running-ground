import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RunPeriodPickerSheet } from '@/features/home/components/overview/RunPeriodPickerSheet';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

// '전체' + 1월~12월. Keys are zero-padded month strings that match a run date's MM (YYYY-MM-DD).
export const YEAR_MONTH_FILTER_MONTH_OPTIONS: readonly { key: string; label: string }[] = [
  { key: 'all', label: '전체' },
  ...Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, '0');
    return { key: month, label: `${index + 1}월` };
  }),
];

export function getYearMonthMonthLabel(monthFilter: string): string {
  return YEAR_MONTH_FILTER_MONTH_OPTIONS.find((option) => option.key === monthFilter)?.label ?? '전체';
}

type ActivePicker = 'year' | 'month' | null;

type YearMonthFilterRowProps = {
  // Years present in the data, newest first. The row renders nothing when this is empty.
  availableYears: string[];
  selectedYear: string | null;
  // 'all' | '01'..'12'
  monthFilter: string;
  onSelectYear: (year: string) => void;
  onSelectMonth: (month: string) => void;
};

// Two trigger buttons (year · month) that open the same scroll/wheel bottom sheet the home
// 내 러닝 기록 card uses. Owns only the open/close picker state; the selected year/month
// stay in the parent so it can drive its own filtering.
function YearMonthFilterRowImpl({
  availableYears,
  selectedYear,
  monthFilter,
  onSelectYear,
  onSelectMonth,
}: YearMonthFilterRowProps) {
  const [activePicker, setActivePicker] = useState<ActivePicker>(null);
  const yearOptions = useMemo(
    () => availableYears.map((year) => ({ key: year, label: `${year}년` })),
    [availableYears],
  );
  const monthLabel = getYearMonthMonthLabel(monthFilter);

  const handleSelect = useCallback((key: string) => {
    setActivePicker((picker) => {
      if (picker === 'year') {
        onSelectYear(key);
      } else if (picker === 'month') {
        onSelectMonth(key);
      }
      return null;
    });
  }, [onSelectMonth, onSelectYear]);
  const close = useCallback(() => setActivePicker(null), []);

  if (availableYears.length === 0) {
    return null;
  }

  return (
    <>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setActivePicker('year')}
          style={styles.button}
        >
          <Text style={styles.label}>{selectedYear ? `${selectedYear}년` : '년도'}</Text>
          <Text style={styles.chevron}>▾</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setActivePicker('month')}
          style={styles.button}
        >
          <Text style={styles.label}>{monthLabel}</Text>
          <Text style={styles.chevron}>▾</Text>
        </Pressable>
      </View>
      <RunPeriodPickerSheet
        visible={activePicker !== null}
        title={activePicker === 'year' ? '년도 선택' : '월 선택'}
        options={activePicker === 'year' ? yearOptions : YEAR_MONTH_FILTER_MONTH_OPTIONS}
        selectedKey={activePicker === 'year' ? (selectedYear ?? '') : monthFilter}
        onSelect={handleSelect}
        onClose={close}
      />
    </>
  );
}

export const YearMonthFilterRow = memo(YearMonthFilterRowImpl);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.s10,
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.brandSoft,
    borderColor: colors.brandSoftBorder,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s10,
  },
  label: {
    color: colors.brand,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  chevron: {
    color: colors.brand,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
});
