import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AddressRegionNode } from '@/features/location/addressCatalog';
import { buildRegionSelectionState } from '@/features/location/RegionSelection';
import { deriveSignupTerminalRegion } from '@/features/location/signupRegionCap';
import {
  fetchMyProfile,
  fetchRegionCatalog,
  getApiErrorMessage,
  updateMyProfile,
  updateMyRegion,
} from '@/services';

// 소셜 로그인 직후 기본 정보(표시 이름 + 지역) 설정 화면의 모델.
// 지역 픽커는 가입/지역설정과 같은 부품(buildRegionSelectionState +
// deriveSignupTerminalRegion)을 재사용하므로 하이브리드 시·도(전남광주통합특별시)
// 의 구/시 혼합 계약도 그대로 따른다. 저장 성공 시 onSaved 콜백으로 라우팅.
export function useCompleteProfile({ onSaved }: { onSaved: () => void }) {
  const [regions, setRegions] = useState<AddressRegionNode[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [provinceName, setProvinceName] = useState('');
  const [secondaryRegionName, setSecondaryRegionName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selection = useMemo(
    () => buildRegionSelectionState(regions, provinceName, secondaryRegionName, ''),
    [regions, provinceName, secondaryRegionName],
  );
  const { finalCityName, finalDistrictName } = deriveSignupTerminalRegion(
    provinceName,
    selection.selectedSecondary,
  );

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);

    Promise.all([fetchMyProfile(), fetchRegionCatalog()])
      .then(([profile, regionCatalog]) => {
        setRegions(regionCatalog.regions);
        setDisplayName(profile.name ?? '');
        setProvinceName(profile.provinceName ?? '');
        setSecondaryRegionName(profile.cityName || profile.districtName || '');
      })
      .catch((loadError) => {
        setError(getApiErrorMessage(loadError, '기본 정보를 불러오지 못했어요.'));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectProvince = (nextProvince: AddressRegionNode) => {
    setProvinceName(nextProvince.name);
    setSecondaryRegionName('');
  };

  const handleSelectSecondary = (nextSecondary: AddressRegionNode) => {
    setSecondaryRegionName(nextSecondary.name);
  };

  const handleSave = async () => {
    const trimmedName = displayName.trim();

    if (!trimmedName) {
      setError('표시 이름을 입력해주세요.');
      return;
    }

    if (!provinceName || !finalDistrictName) {
      setError('시/도와 최종 지역을 선택해주세요.');
      return;
    }

    setError(null);
    setSaving(true);

    try {
      // 이름 → 지역 순서로 저장. 이름은 태그/상태메시지를 건드리지 않도록 name만 보낸다.
      await updateMyProfile({ name: trimmedName });
      await updateMyRegion({
        provinceName,
        cityName: finalCityName,
        districtName: finalDistrictName,
      });
      onSaved();
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, '기본 정보 저장에 실패했어요.'));
      setSaving(false);
    }
  };

  return {
    displayName,
    error,
    handleSave,
    handleSelectProvince,
    handleSelectSecondary,
    loadData,
    loading,
    provinceName,
    regions,
    saving,
    secondaryRegionName,
    selection,
    setDisplayName,
  };
}
