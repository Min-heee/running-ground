import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import type { RunningMatchRoom } from '@/lib/api/types';
import { formatMatchCountdown } from '@/lib/matchCountdown';
import { formatRoomDateLabel } from '@/features/runs/utils/matchRoomScheduling';
import { colors, fixedColors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

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
    gap: spacing.s14,
  },
  roomTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.s12,
  },
  roomModeTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.summaryValue,
    fontWeight: fontWeights.black,
  },
  roomMeta: {
    color: colors.textMuted,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
  },
  codePill: {
    borderRadius: radii.pill,
    backgroundColor: colors.indigoInk,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.xxl,
  },
  codePillText: {
    color: colors.brandWashStrong,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
  },
  actionGrid: {
    gap: spacing.s10,
  },
  countdownBanner: {
    borderRadius: radii.lg,
    backgroundColor: colors.indigoInk,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s14,
    gap: spacing.sm,
  },
  countdownBannerTitle: {
    color: fixedColors.brandWash,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.black,
  },
  countdownBannerText: {
    color: colors.brandLighter,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
});
