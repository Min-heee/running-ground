import { Screen } from '@/components/Screen';
import { HomeOverview } from '@/features/home/HomeOverview';
import { weeklySummary } from '@/data/mock';

export default function HomeScreen() {
  return (
    <Screen>
      <HomeOverview summary={weeklySummary} />
    </Screen>
  );
}
