import { useLocalSearchParams } from 'expo-router';
import { TrackRunExperience } from '@/features/runs/TrackRunExperience';
import { useTabWarmupTrace } from '@/utils/useTabWarmupTrace';

export default function RunningTabScreen() {
  useTabWarmupTrace('running');
  const params = useLocalSearchParams<{
    focusMatchMode?: string;
    focusMatchId?: string;
    focusMatchDistanceKm?: string;
    focusMatchSlotStartAt?: string;
    focusMatchIsTest?: string;
    focusMatchNonce?: string;
    forceMatchArena?: string;
    focusRoomId?: string;
    roomInviteToken?: string;
  }>();

  const focusMatchMode = params.focusMatchMode === 'group' ? 'group' : params.focusMatchMode === 'duel' ? 'duel' : undefined;

  return (
    <TrackRunExperience
      mode="tab"
      focusMatchMode={focusMatchMode}
      focusMatchId={typeof params.focusMatchId === 'string' ? params.focusMatchId : undefined}
      focusMatchDistanceKm={
        typeof params.focusMatchDistanceKm === 'string'
          ? Number.parseFloat(params.focusMatchDistanceKm)
          : undefined
      }
      focusMatchSlotStartAt={typeof params.focusMatchSlotStartAt === 'string' ? params.focusMatchSlotStartAt : undefined}
      focusMatchIsTest={params.focusMatchIsTest === '1'}
      focusMatchNonce={typeof params.focusMatchNonce === 'string' ? params.focusMatchNonce : undefined}
      forceMatchArena={params.forceMatchArena === '1'}
      focusRoomId={typeof params.focusRoomId === 'string' ? params.focusRoomId : undefined}
      roomInviteToken={typeof params.roomInviteToken === 'string' ? params.roomInviteToken : undefined}
    />
  );
}
