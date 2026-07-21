import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import {
  fetchOpponentMatchProfile,
  getApiErrorMessage,
  type OpponentMatchProfile,
} from '@/services';
import { colors, fixedColors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

function formatLifetimeDistanceKm(distanceKm: number) {
  return Number(distanceKm.toFixed(1));
}

export default function OpponentProfileScreen() {
  const { userId, name } = useLocalSearchParams<{ userId?: string; name?: string }>();
  const [profile, setProfile] = useState<OpponentMatchProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // C-6 — fetch extracted to a callback so the error state can offer 다시 시도 (a slow/failed
  // finish-window response used to leave only header + error text, dead-ended).
  const loadProfile = useCallback((signal: { cancelled: boolean }) => {
    if (!userId) {
      setProfile(null);
      setError('상대 정보를 찾을 수 없어요.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setProfile(null);
    fetchOpponentMatchProfile(userId)
      .then((nextProfile) => {
        if (!signal.cancelled) {
          setProfile(nextProfile);
        }
      })
      .catch((profileError) => {
        if (!signal.cancelled) {
          setError(getApiErrorMessage(profileError, '상대 프로필을 불러오지 못했어요.'));
        }
      })
      .finally(() => {
        if (!signal.cancelled) {
          setLoading(false);
        }
      });
  }, [userId]);
  // Retry re-runs the effect (fresh cancellation signal) instead of calling loadProfile
  // outside it, so an unmount mid-retry still cancels cleanly.
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    const signal = { cancelled: false };
    loadProfile(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [loadProfile, retryNonce]);

  const displayName = profile?.name ?? name ?? '상대';
  const regionLabel = useMemo(() => {
    if (!profile) {
      return '';
    }
    return [profile.provinceName, profile.cityName, profile.districtName].filter(Boolean).join(' ');
  }, [profile]);

  return (
    <Screen>
      <AuthHeader
        title="상대 프로필"
        subtitle={`${displayName}의 공개 대결 정보를 확인해요.`}
        showBack
      />

      {loading ? <ActivityIndicator size="large" color={colors.brand} /> : null}
      {error ? (
        <>
          <Text style={styles.errorText}>{error}</Text>
          {userId ? (
            <SecondaryButton label="다시 시도" onPress={() => setRetryNonce((nonce) => nonce + 1)} />
          ) : null}
        </>
      ) : null}

      {profile ? (
        <>
          <Card style={styles.profileCard}>
            <Text style={styles.profileLabel}>대결 상대</Text>
            <Text style={styles.profileName}>{profile.name}</Text>
            <Text style={styles.profileTag}>{profile.publicTag}</Text>
          </Card>

          <View style={styles.summaryRow}>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>지역</Text>
              <Text style={styles.summaryValue}>{regionLabel || '지역 미설정'}</Text>
            </Card>
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>랭크</Text>
              <Text style={styles.summaryValue}>{profile.rankState.tier} · {profile.rankState.lp} LP</Text>
            </Card>
          </View>

          <Card style={styles.recordCard}>
            <View style={styles.recordHeader}>
              <Text style={styles.sectionTitle}>전적</Text>
              <View style={styles.recordBadge}>
                <Text style={styles.recordBadgeText}>{profile.matchRecord.total}전</Text>
              </View>
            </View>
            <Text style={styles.recordDetail}>
              1대1 {profile.matchRecord.duel} · 그룹 {profile.matchRecord.group}
            </Text>
          </Card>

          <Card style={styles.distanceCard}>
            <Text style={styles.summaryLabel}>누적 거리</Text>
            <Text style={styles.distanceValue}>{formatLifetimeDistanceKm(profile.lifetimeDistanceKm)}km</Text>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    backgroundColor: fixedColors.textPrimary,
    gap: spacing.lg,
  },
  profileLabel: {
    color: colors.brandLighter,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  profileName: {
    color: colors.white,
    fontSize: fontSizes.pageTitle,
    fontWeight: fontWeights.black,
  },
  profileTag: {
    color: fixedColors.textTertiary,
    fontWeight: fontWeights.bold,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.s10,
  },
  summaryCard: {
    flex: 1,
    gap: spacing.lg,
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  summaryValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    lineHeight: 24,
  },
  recordCard: {
    gap: spacing.s10,
  },
  recordHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s12,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  recordBadge: {
    borderRadius: radii.pill,
    backgroundColor: colors.brandWash,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.xxl,
  },
  recordBadgeText: {
    color: colors.brandDeep,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  recordDetail: {
    color: colors.textMuted,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.bold,
  },
  distanceCard: {
    gap: spacing.lg,
  },
  distanceValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.metric,
    fontWeight: fontWeights.extraBold,
  },
  errorText: {
    color: colors.danger,
    fontWeight: fontWeights.bold,
  },
});
