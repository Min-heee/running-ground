import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { fetchMyProfile, updateMyRegion } from '@/lib/api/services';

const regions = ['강남구', '서초구', '송파구', '마포구', '성동구'];

export default function RegionSettingsScreen() {
  const [selectedRegion, setSelectedRegion] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMyProfile()
      .then((profile) => {
        setSelectedRegion(profile.districtName);
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : '지역 정보를 불러오지 못했어.');
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!selectedRegion) {
      setError('지역을 먼저 선택해줘.');
      return;
    }

    setError(null);
    setSaving(true);

    try {
      const nextProfile = await updateMyRegion({ districtName: selectedRegion });
      setSelectedRegion(nextProfile.districtName);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '지역 저장에 실패했어.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <AuthHeader
        title="지역 설정"
        subtitle="내가 속한 지역을 선택하면 구 내 경쟁과 지역 배틀이 그 기준으로 반영돼."
        showBack
        backHref="/(tabs)/mypage"
      />

      {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}

      {!loading ? (
        <>
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

          <PrimaryButton label={saving ? '저장 중...' : '지역 저장하기'} onPress={handleSave} />
          <SecondaryButton label="마이페이지로 돌아가기" onPress={() => router.replace('/(tabs)/mypage')} />
          {saved ? <Text style={styles.savedText}>지역이 저장됐어.</Text> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  regionRow: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  regionRowSelected: {
    backgroundColor: '#F5F3FF',
    borderColor: '#C7D2FE',
  },
  regionName: {
    color: '#111827',
    fontWeight: '700',
  },
  regionMeta: {
    color: '#667085',
    marginTop: 4,
  },
  selectedText: {
    color: '#6D5EF7',
    fontWeight: '800',
  },
  savedText: {
    color: '#067647',
    fontWeight: '700',
  },
  errorText: {
    color: '#B42318',
    fontWeight: '700',
    lineHeight: 20,
  },
});
