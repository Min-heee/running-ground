import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import type { RunningMatchRoom } from '@/lib/api/types';
import { formatMatchCountdown } from '@/lib/matchCountdown';
import { formatRoomDateLabel } from '@/features/runs/utils/matchRoomScheduling';
import { colors } from '@/theme/tokens';

type MatchRoomSummaryCardProps = {
  room: RunningMatchRoom;
  isInvitedOnly: boolean;
  showLoadingBanner: boolean;
  showCountdownBanner: boolean;
  linkedMatchRemainingSeconds: number | null;
  onInviteFriends: () => void;
  onCopyCode: () => void;
};

export function MatchRoomSummaryCard({
  room,
  isInvitedOnly,
  showLoadingBanner,
  showCountdownBanner,
  linkedMatchRemainingSeconds,
  onInviteFriends,
  onCopyCode,
}: MatchRoomSummaryCardProps) {
  return (
    <Card style={styles.lobbyCard}>
      <View style={styles.roomTopRow}>
        <View>
          <Text style={styles.roomModeTitle}>{room.mode === 'duel' ? '1대1 대결' : '그룹 대결'}</Text>
          <Text style={styles.roomMeta}>{room.hostName}님 방 · {room.participants.length}/{room.maxParticipants}명</Text>
          <Text style={styles.roomMeta}>거리 · {room.distanceKm}km</Text>
          <Text style={styles.roomMeta}>
            시작 방식 · {room.startMode === 'host' ? '방장 시작' : `예약 시작 ${formatRoomDateLabel(room.slotStartAt)}`}
          </Text>
        </View>
        <View style={styles.codePill}>
          <Text style={styles.codePillText}>{room.inviteToken}</Text>
        </View>
      </View>
      {showLoadingBanner ? (
        <View style={styles.countdownBanner}>
          <Text style={styles.countdownBannerTitle}>로딩중...</Text>
          <Text style={styles.countdownBannerText}>
            대결 화면을 맞추는 중이에요. 잠시 뒤 모든 참가자에게 같은 카운트다운이 보여요.
          </Text>
        </View>
      ) : null}
      {showCountdownBanner && linkedMatchRemainingSeconds ? (
        <View style={styles.countdownBanner}>
          <Text style={styles.countdownBannerTitle}>시작까지 {formatMatchCountdown(linkedMatchRemainingSeconds)}</Text>
          <Text style={styles.countdownBannerText}>20초 전이 되면 자동으로 대결 화면으로 이동해요.</Text>
        </View>
      ) : null}
      {!isInvitedOnly ? (
        <View style={styles.actionGrid}>
          <SecondaryButton label="친구 초대" onPress={onInviteFriends} />
          <SecondaryButton label="방 코드 복사" onPress={onCopyCode} />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  lobbyCard: {
    gap: 14,
  },
  roomTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  roomModeTitle: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '900',
  },
  roomMeta: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  codePill: {
    borderRadius: 999,
    backgroundColor: colors.indigoInk,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  codePillText: {
    color: colors.brandWashStrong,
    fontSize: 13,
    fontWeight: '800',
  },
  actionGrid: {
    gap: 10,
  },
  countdownBanner: {
    borderRadius: 18,
    backgroundColor: colors.indigoInk,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 4,
  },
  countdownBannerTitle: {
    color: colors.brandWash,
    fontSize: 18,
    fontWeight: '900',
  },
  countdownBannerText: {
    color: colors.brandLighter,
    fontSize: 13,
    fontWeight: '600',
  },
});
