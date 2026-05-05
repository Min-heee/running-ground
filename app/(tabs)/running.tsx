import { useLocalSearchParams } from 'expo-router';
import { TrackRunExperience } from '@/features/runs/TrackRunExperience';

export default function RunningTabScreen() {
  const params = useLocalSearchParams<{
    focusMatchMode?: string;
    focusMatchDistanceKm?: string;
    focusMatchSlotStartAt?: string;
    focusMatchIsTest?: string;
    focusMatchNonce?: string;
    forceMatchArena?: string;
    roomInviteToken?: string;
  }>();

  const focusMatchMode = params.focusMatchMode === 'group' ? 'group' : params.focusMatchMode === 'duel' ? 'duel' : undefined;

  return (
    <TrackRunExperience
      mode="tab"
      focusMatchMode={focusMatchMode}
      focusMatchDistanceKm={
        typeof params.focusMatchDistanceKm === 'string'
          ? Number.parseFloat(params.focusMatchDistanceKm)
          : undefined
      }
      focusMatchSlotStartAt={typeof params.focusMatchSlotStartAt === 'string' ? params.focusMatchSlotStartAt : undefined}
      focusMatchIsTest={params.focusMatchIsTest === '1'}
      focusMatchNonce={typeof params.focusMatchNonce === 'string' ? params.focusMatchNonce : undefined}
      forceMatchArena={params.forceMatchArena === '1'}
      roomInviteToken={typeof params.roomInviteToken === 'string' ? params.roomInviteToken : undefined}
    />
  );
}
