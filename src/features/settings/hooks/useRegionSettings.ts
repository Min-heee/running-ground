import { useEffect, useMemo, useState } from 'react';
import type { AddressRegionNode } from '@/features/location/addressCatalog';
import { buildRegionSelectionState } from '@/features/location/RegionSelection';
import { deriveSignupTerminalRegion } from '@/features/location/signupRegionCap';
import { fetchMyProfile, fetchRegionCatalog, getApiErrorMessage, updateMyRegion } from '@/services';

export function useRegionSettings() {
  const [regions, setRegions] = useState<AddressRegionNode[]>([]);
  const [provinceName, setProvinceName] = useState('');
  const [secondaryRegionName, setSecondaryRegionName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selection = useMemo(
    () => buildRegionSelectionState(regions, provinceName, secondaryRegionName, ''),
    [regions, provinceName, secondaryRegionName],
  );
  // Settings picks a region in two steps (시/도 → 시/군/구), mirroring signup.
  // Every 시/군 is a leaf in the pruned catalog, so the second-level pick is
  // always terminal and we never surface a third (구) step. The submitted payload
  // comes from the SAME helper signup uses, so 경기도→고양시 sends
  // cityName='고양시', districtName='고양시' (NOT '') per the backend contract.
  const { finalCityName, finalDistrictName } = deriveSignupTerminalRegion(
    provinceName,
    selection.selectedSecondary,
  );

  useEffect(() => {
    Promise.all([fetchMyProfile(), fetchRegionCatalog()])
      .then(([profile, regionCatalog]) => {
        setRegions(regionCatalog.regions);
        setProvinceName(profile.provinceName ?? '');
        setSecondaryRegionName(profile.cityName || profile.districtName);
      })
      .catch((loadError) => {
        setError(getApiErrorMessage(loadError, '지역 정보를 불러오지 못했어요.'));
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSelectProvince = (nextProvince: AddressRegionNode) => {
    setProvinceName(nextProvince.name);
    setSecondaryRegionName('');
  };

  const handleSelectSecondary = (nextSecondary: AddressRegionNode) => {
    setSecondaryRegionName(nextSecondary.name);
  };

  const handleSave = async () => {
    if (!provinceName || !finalDistrictName) {
      setError('시/도와 최종 지역을 먼저 선택해주세요.');
      return;
    }

    setError(null);
    setSaving(true);

    try {
      const nextProfile = await updateMyRegion({
        provinceName,
        cityName: finalCityName,
        districtName: finalDistrictName,
      });
      setProvinceName(nextProfile.provinceName ?? '');
      setSecondaryRegionName(nextProfile.cityName || nextProfile.districtName);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, '지역 저장에 실패했어요.'));
    } finally {
      setSaving(false);
    }
  };

  return {
    error,
    handleSave,
    handleSelectProvince,
    handleSelectSecondary,
    loading,
    provinceName,
    regions,
    saved,
    saving,
    secondaryRegionName,
    selection,
  };
}
