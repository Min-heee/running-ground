import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { weeklySummary } from '@/data/mock';
import { PageHeader } from '@/components/ui/PageHeader';
import { InfoCard } from '@/components/ui/InfoCard';
import { ListRow } from '@/components/ui/ListRow';

export default function LeagueScreen() {
  return (
    <Screen>
      <PageHeader title="지역 배틀" subtitle="우리 지역의 평균 거리와 참여율을 기준으로 경쟁하는 공간." />

      <InfoCard title="현재 상태">지역 경쟁은 총합보다 참여 멤버 평균 거리 중심으로 보는 게 핵심이야.</InfoCard>

      <Card>
        <SectionTitle>현재 순위</SectionTitle>
        <ListRow>{`${weeklySummary.districtBattle.myDistrict} 평균 ${weeklySummary.districtBattle.averageDistancePerMember}km`}</ListRow>
        <ListRow>{`총 거리 ${weeklySummary.districtBattle.totalDistanceKm}km`}</ListRow>
        <ListRow>{`참여율 ${weeklySummary.districtBattle.participationRate}%`}</ListRow>
      </Card>
    </Screen>
  );
}
