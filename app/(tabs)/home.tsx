import { useEffect, useState } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { Screen } from '@/components/Screen';
import { HomeOverview } from '@/features/home/HomeOverview';
import { WeeklySummary } from '@/domain/types';
import { fetchHomeSummary } from '@/lib/api/services';
import { InfoCard } from '@/components/ui/InfoCard';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { colors } from '@/theme';

export default function HomeScreen() {
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHomeSummary()
      .then((data) => setSummary(data))
      .catch(() => setError('홈 정보를 불러오지 못했어.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Screen>
      <InfoCard title="출시 MVP 기준">지금 홈은 내 활동, 친구 경쟁, 기록 연동처럼 바로 써야 하는 흐름에 집중하고 있어.</InfoCard>
      <View style={styles.contentWrap}>
        {loading ? <ActivityIndicator size="large" color={colors.brandPrimary} /> : null}
        {error ? <ErrorBanner message={error} /> : null}
        {summary ? <HomeOverview summary={summary} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  contentWrap: {
    gap: 16,
  },
});
