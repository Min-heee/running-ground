import { useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { colors, radius } from '@/theme';

const regions = ['강남구', '서초구', '송파구', '마포구', '성동구'];

export default function RegionSettingsScreen() {
  const [selectedRegion, setSelectedRegion] = useState('강남구');

  return (
    <Screen>
      <AuthHeader title="지역 설정" subtitle="내가 속한 지역을 선택하면 구 내 경쟁과 지역 배틀이 그 기준으로 반영돼." />

      <Card>
        <View style={styles.list}>
          {regions.map((region) => {
            const selected = region === selectedRegion;
            return (
              <Pressable key={region} style={[styles.regionRow, selected && styles.regionRowSelected]} onPress={() => setSelectedRegion(region)}>
                <View>
                  <Text style={styles.regionName}>{region}</Text>
                  <Text style={styles.regionMeta}>{selected ? '현재 선택된 지역' : '선택 가능'}</Text>
                </View>
                {selected ? <Text style={styles.selectedText}>선택됨</Text> : null}
              </Pressable>
            );
          })}
        </View>
      </Card>

      <PrimaryButton label="지역 저장하기" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  regionRow: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderInput,
    borderRadius: radius.lg,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  regionRowSelected: {
    backgroundColor: colors.brandPrimaryAlt,
    borderColor: colors.brandPrimaryMuted,
  },
  regionName: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  regionMeta: {
    color: colors.textMuted,
    marginTop: 4,
  },
  selectedText: {
    color: colors.brandPrimary,
    fontWeight: '800',
  },
});
