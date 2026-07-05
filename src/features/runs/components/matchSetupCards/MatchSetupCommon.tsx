import { Pressable, Text, View } from 'react-native';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import type { RunningMatchState } from '@/lib/api/types';
import { matchSetupCardStyles as styles } from '@/features/runs/components/matchSetupCards/styles';

export function MatchNotice({
  notice,
  needsManualRematch,
  onRequestRematch,
}: {
  notice: string | null;
  needsManualRematch: boolean;
  onRequestRematch: () => void;
}) {
  if (!notice) {
    return null;
  }

  return (
    <View style={styles.matchNoticeBlock}>
      <Text style={styles.matchNoticeText}>{notice}</Text>
      {needsManualRematch ? (
        <Pressable style={styles.matchNoticeAction} onPress={onRequestRematch}>
          <Text style={styles.matchNoticeActionText}>같은 조건으로 다시 찾기</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function MatchActionButtons({
  matchState,
  cancelingLabel,
  waitingCancelLabel,
  matchedCancelLabel,
  requestLabel,
  isCancelingMatch,
  reservationLocked,
  canCreateMatch,
  blockingMatchHelperText,
  onCancelMatch,
  onRequestMatch,
}: {
  matchState: RunningMatchState;
  cancelingLabel: string;
  waitingCancelLabel: string;
  matchedCancelLabel: string;
  requestLabel: string;
  isCancelingMatch: boolean;
  reservationLocked: boolean;
  canCreateMatch: boolean;
  blockingMatchHelperText: string | null;
  onCancelMatch: () => void;
  onRequestMatch: () => void;
}) {
  return (
    <>
      {matchState === 'waiting' || matchState === 'matched' ? (
        <>
          <SecondaryButton
            label={isCancelingMatch ? cancelingLabel : matchState === 'matched' ? matchedCancelLabel : waitingCancelLabel}
            onPress={onCancelMatch}
            disabled={reservationLocked}
          />
          {reservationLocked ? <Text style={styles.matchCancelHelperText}>출발 1시간 전부터는 예약을 취소할 수 없어요.</Text> : null}
        </>
      ) : matchState === 'active' ? null : (
        <View style={styles.matchActionColumn}>
          <SecondaryButton label={requestLabel} onPress={onRequestMatch} disabled={!canCreateMatch} />
        </View>
      )}
      {!canCreateMatch && blockingMatchHelperText ? (
        <View style={styles.matchForceLeaveBlock}>
          <Text style={styles.matchCancelHelperText}>{blockingMatchHelperText}</Text>
        </View>
      ) : null}
    </>
  );
}
