import { useEffect, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { Screen } from '@/components/Screen';
import { HomeOverview } from '@/features/home/HomeOverview';
import { WeeklySummary } from '@/domain/types';
import { fetchHomeSummary } from '@/lib/api/services';

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
      {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}
      {error ? <Text>{error}</Text> : null}
      {summary ? <HomeOverview summary={summary} /> : null}
    </Screen>
  );
}
