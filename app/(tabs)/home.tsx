import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { HomeOverview } from '@/features/home/HomeOverview';
import { AppNotice, UserProfile, WeeklySummary } from '@/domain/types';
import { syncScheduledMatchNotifications } from '@/lib/matchNotifications';
import { cancelRunningMatch, fetchActiveNotices, fetchHomeSummary, fetchMyActivity, fetchMyProfile, fetchNotificationSettings, fetchUpcomingRunningMatches } from '@/lib/api/services';
import { getCurrentUserProfile } from '@/lib/session';
import { MyActivityResponse, UpcomingRunningMatchItem } from '@/lib/api/types';

export default function HomeScreen() {
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [notices, setNotices] = useState<AppNotice[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(getCurrentUserProfile());
  const [activity, setActivity] = useState<MyActivityResponse | null>(null);
  const [upcomingMatches, setUpcomingMatches] = useState<UpcomingRunningMatchItem[]>([]);
  const [matchRemindersEnabled, setMatchRemindersEnabled] = useState(true);
  const [cancelingMatchId, setCancelingMatchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHome = useCallback(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      const [summaryResult, profileResult, activityResult, noticesResult, upcomingMatchesResult, notificationSettingsResult] = await Promise.allSettled([
        fetchHomeSummary(),
        fetchMyProfile(),
        fetchMyActivity(),
        fetchActiveNotices(),
        fetchUpcomingRunningMatches(),
        fetchNotificationSettings(),
      ]);

      if (!active) {
        return;
      }

      if (noticesResult.status === 'fulfilled') {
        setNotices(noticesResult.value.items.slice(0, 2));
      } else {
        setNotices([]);
      }

      if (upcomingMatchesResult.status === 'fulfilled') {
        setUpcomingMatches(upcomingMatchesResult.value.items);
      } else {
        setUpcomingMatches([]);
      }

      if (notificationSettingsResult.status === 'fulfilled') {
        setMatchRemindersEnabled(notificationSettingsResult.value.matchReminders);
      }

      if (summaryResult.status === 'rejected') {
        setSummary(null);
        setError('홈 정보를 불러오지 못했어.');
        setLoading(false);
        return;
      }

      const summaryData = summaryResult.value;
      setSummary(summaryData);

      if (profileResult.status === 'fulfilled') {
        setProfile(profileResult.value);
      } else {
        setProfile(getCurrentUserProfile());
      }

      if (activityResult.status === 'fulfilled') {
        setActivity(activityResult.value);
      } else {
        setActivity(null);
      }

      setLoading(false);
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  useFocusEffect(loadHome);

  useEffect(() => {
    void syncScheduledMatchNotifications(upcomingMatches, matchRemindersEnabled);
  }, [matchRemindersEnabled, upcomingMatches]);

  const handleCancelUpcomingMatch = async (match: UpcomingRunningMatchItem) => {
    try {
      setError(null);
      setCancelingMatchId(match.matchId);
      await cancelRunningMatch({
        mode: match.mode,
        distanceKm: match.distanceKm,
        slotStartAt: match.slotStartAt,
        matchId: match.matchId,
      });
      const payload = await fetchUpcomingRunningMatches();
      setUpcomingMatches(payload.items);
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : '예약을 취소하지 못했어.');
    } finally {
      setCancelingMatchId(null);
    }
  };

  return (
    <Screen>
      <View style={styles.contentWrap}>
        <View style={styles.headerWrap}>
          <Text style={styles.headerLabel}>홈</Text>
          <Text style={styles.headerBrand}>RunningGround</Text>
        </View>
        {notices.map((notice) => (
          <Card key={notice.id} style={styles.noticeCard}>
            <Text style={styles.noticeLabel}>운영 공지</Text>
            <Text style={styles.noticeTitle}>{notice.title}</Text>
            <Text style={styles.noticeMessage}>{notice.message}</Text>
          </Card>
        ))}
        {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}
        {error ? <Text>{error}</Text> : null}
        {upcomingMatches.length ? (
          <Card style={styles.upcomingCard}>
            <Text style={styles.upcomingLabel}>다가오는 대결</Text>
            {upcomingMatches.slice(0, 2).map((match) => (
              <View key={match.matchId} style={styles.upcomingRow}>
                <View style={styles.upcomingCopy}>
                  <Text style={styles.upcomingTitle}>
                    {match.mode === 'duel' ? '1대1 대결' : '그룹 대결'} · {match.summary}
                  </Text>
                  <Text style={styles.upcomingMeta}>{match.counterpartLabel}</Text>
                  {match.status === 'matched' ? (
                    match.canCancel ? (
                      <Pressable
                        style={styles.upcomingCancelButton}
                        onPress={() => {
                          void handleCancelUpcomingMatch(match);
                        }}
                      >
                        <Text style={styles.upcomingCancelText}>
                          {cancelingMatchId === match.matchId ? '취소 중...' : '예약 취소'}
                        </Text>
                      </Pressable>
                    ) : (
                      <Text style={styles.upcomingHelperText}>출발 1시간 전부터는 취소할 수 없어요.</Text>
                    )
                  ) : null}
                </View>
                <Text style={styles.upcomingState}>{match.status === 'active' ? '진행 중' : '예약됨'}</Text>
              </View>
            ))}
          </Card>
        ) : null}
        {summary ? (
          <HomeOverview
            summary={summary}
            lifetimeDistanceKm={profile?.lifetimeDistanceKm}
            runs={activity?.runs ?? []}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  contentWrap: {
    gap: 16,
  },
  headerWrap: {
    gap: 4,
    paddingTop: 4,
  },
  headerLabel: {
    color: '#101828',
    fontSize: 28,
    fontWeight: '800',
  },
  headerBrand: {
    color: '#6D5EF7',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  noticeCard: {
    backgroundColor: '#111827',
    gap: 6,
  },
  noticeLabel: {
    color: '#C7D2FE',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  noticeTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  noticeMessage: {
    color: '#D0D5DD',
    lineHeight: 21,
  },
  upcomingCard: {
    backgroundColor: '#111827',
    gap: 10,
  },
  upcomingLabel: {
    color: '#C7D2FE',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 10,
  },
  upcomingCopy: {
    flex: 1,
    gap: 4,
  },
  upcomingTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  upcomingMeta: {
    color: '#D0D5DD',
    lineHeight: 19,
  },
  upcomingCancelButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  upcomingCancelText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  upcomingHelperText: {
    color: '#A5B4FC',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  upcomingState: {
    color: '#A5B4FC',
    fontSize: 12,
    fontWeight: '800',
  },
});
