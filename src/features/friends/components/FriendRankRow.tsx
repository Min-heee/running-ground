import { memo, useCallback } from 'react';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import type { FriendRank } from '@/domain';
import { PodiumBadge } from '@/features/league/components/LeagueRankBadges';
import { friendsRankingStyles as styles } from './friendsRankingStyles';

type FriendRankRowProps = {
  runner: FriendRank;
  isMine: boolean;
};

export const FriendRankRow = memo(function FriendRankRow({ runner, isMine }: FriendRankRowProps) {
  // `<Link asChild>`를 쓰지 않는다: Slot이 Link의 style과 자식의 배열 style을 겹쳐 병합하는데,
  // 웹에선 그 배열이 <a>의 style로 그대로 내려가 렌더가 죽는다(친구 탭 전체가 오류 화면).
  // 네이티브는 배열을 펼쳐 멀쩡했지만 같은 함정이라 router.push로 직접 간다 (기록 행과 동일).
  const handleOpen = useCallback(() => {
    router.push({ pathname: '/friend-detail', params: { friendId: runner.id } });
  }, [runner.id]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${runner.rank}위 ${runner.name}`}
      onPress={handleOpen}
      style={[styles.rankCard, isMine ? styles.myCard : null]}
    >
        <View style={styles.rankRow}>
          {/* 1~3위는 지역랭킹과 같은 금은동 왕관 배지(양 모드 동일한 메달 파스텔),
              4위부터는 감싸개 없이 맨 텍스트 (오너 2026-08-03). */}
          <View style={styles.rankSlot}>
            {runner.rank <= 3 ? (
              <PodiumBadge rank={runner.rank} />
            ) : (
              <Text style={styles.rankPlain}>{runner.rank}위</Text>
            )}
          </View>

          <View style={styles.runnerMeta}>
            <View style={styles.nameRow}>
              <Text numberOfLines={1} style={styles.runnerName}>
                {runner.name}
              </Text>
              {isMine ? (
                <View style={styles.selfBadge}>
                  <Text style={styles.selfBadgeText}>나</Text>
                </View>
              ) : null}
              {runner.isRunningNow ? (
                <View style={styles.livePill}>
                  <View style={styles.livePillDot} />
                  <Text style={styles.livePillText}>러닝 중</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.metricInline}>
            <Text style={styles.metricInlineValue}>{runner.distanceKm}km</Text>
          </View>

          <View style={styles.metricInline}>
            <Text style={styles.metricInlineValue}>{runner.points}P</Text>
          </View>
        </View>
    </Pressable>
  );
});
