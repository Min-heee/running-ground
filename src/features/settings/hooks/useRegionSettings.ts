import { useEffect, useMemo, useState } from 'react';
import type { AddressRegionNode } from '@/features/location/addressCatalog';
import { buildRegionSelectionState } from '@/features/location/RegionSelection';
import { fetchMyProfile, fetchRegionCatalog, updateMyRegion } from '@/services';

export function useRegionSettings() {
  const [regions, setRegions] = useState<AddressRegionNode[]>([]);
  const [provinceName, setProvinceName] = useState('');
  const [secondaryRegionName, setSecondaryRegionName] = useState('');
  const [tertiaryRegionName, setTertiaryRegionName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selection = useMemo(
    () => buildRegionSelectionState(regions, provinceName, secondaryRegionName, tertiaryRegionName),
    [regions, provinceName, secondaryRegionName, tertiaryRegionName],
  );

  useEffect(() => {
    Promise.all([fetchMyProfile(), fetchRegionCatalog()])
      .then(([profile, regionCatalog]) => {
        setRegions(regionCatalog.regions);
        setProvinceName(profile.provinceName ?? '');
        setSecondaryRegionName(profile.cityName || profile.districtName);
        setTertiaryRegionName(profile.cityName && profile.cityName !== profile.districtName ? profile.districtName : '');
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : '지역 정보를 불러오지 못했어.');
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSelectProvince = (nextProvince: AddressRegionNode) => {
    setProvinceName(nextProvince.name);
    setSecondaryRegionName('');
    setTertiaryRegionName('');
  };

  const handleSelectSecondary = (nextSecondary: AddressRegionNode) => {
    setSecondaryRegionName(nextSecondary.name);
    setTertiaryRegionName('');
  };

  const handleSelectTertiary = (nextTertiary: AddressRegionNode) => setTertiaryRegionName(nextTertiary.name);

  const handleSave = async () => {
    if (!provinceName || !selection.finalDistrictName) {
      setError('시/도와 최종 지역을 먼저 선택해줘.');
      return;
    }

    setError(null);
    setSaving(true);

    try {
      const nextProfile = await updateMyRegion({
        provinceName,
        cityName: selection.finalCityName,
        districtName: selection.finalDistrictName,
      });
      setProvinceName(nextProfile.provinceName ?? '');
      setSecondaryRegionName(nextProfile.cityName || nextProfile.districtName);
      setTertiaryRegionName(nextProfile.cityName && nextProfile.cityName !== nextProfile.districtName ? nextProfile.districtName : '');
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '지역 저장에 실패했어.');
    } finally {
      setSaving(false);
    }
  };

  return {
    error,
    handleSave,
    handleSelectProvince,
    handleSelectSecondary,
    handleSelectTertiary,
    loading,
    provinceName,
    regions,
    saved,
    saving,
    secondaryRegionName,
    selection,
    tertiaryRegionName,
  };
}
