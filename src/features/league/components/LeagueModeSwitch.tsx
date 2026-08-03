import { useCallback } from 'react';

import { SegmentSwitch } from '@/components/ui/SegmentSwitch';
import type { LeagueMode } from '@/features/league/types/league';

type LeagueModeSwitchProps = {
  mode: LeagueMode;
  onChange: (mode: LeagueMode) => void;
};

// 러닝탭 혼자/매칭/파티런과 같은 공용 세그먼트 결 (오너 2026-08-04 일괄 통일).
const LEAGUE_MODE_ITEMS = [
  { id: 'region', label: '지역' },
  { id: 'rank', label: '랭크' },
  { id: 'today', label: '오늘' },
] as const;

export function LeagueModeSwitch({ mode, onChange }: LeagueModeSwitchProps) {
  const handleSelect = useCallback((id: string) => {
    onChange(id as LeagueMode);
  }, [onChange]);

  return <SegmentSwitch items={LEAGUE_MODE_ITEMS} activeId={mode} onSelect={handleSelect} />;
}
