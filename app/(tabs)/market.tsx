import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { PageHeader } from '@/components/ui/PageHeader';
import { InfoCard } from '@/components/ui/InfoCard';
import { ListRow } from '@/components/ui/ListRow';

export default function MarketScreen() {
  return (
    <Screen>
      <PageHeader title="마켓" subtitle="포인트와 마일리지를 실제 보상 경험으로 이어주는 공간." />

      <InfoCard title="준비 중">포인트/마일리지 기반 리워드와 아이템 구조를 붙일 예정.</InfoCard>

      <Card>
        <SectionTitle>예상 구성</SectionTitle>
        <ListRow>배지 / 프로필 테마</ListRow>
        <ListRow>러닝 챌린지 보상</ListRow>
        <ListRow>제휴 쿠폰</ListRow>
      </Card>
    </Screen>
  );
}
