import { Pressable, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
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
          {/* 매칭 신청은 해당 모드의 유일한 메인 CTA — 브랜드 보라 솔리드로 (오너 2026-07-27:
              무색이라 버튼인지 몰랐다는 피드백). 취소류는 조용한 secondary 유지. */}
          <PrimaryButton label={requestLabel} onPress={onRequestMatch} disabled={!canCreateMatch} />
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
