import { StyleSheet, Text } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { weeklySummary } from '@/data/mock';

export default function LeagueScreen() {
  return (
    <Screen>
      <Text style={styles.title}>지역 배틀</Text>
      <Card>
        <SectionTitle>현재 순위</SectionTitle>
        <Text style={styles.row}>{weeklySummary.districtBattle.myDistrict} 평균 {weeklySummary.districtBattle.averageDistancePerMember}km</Text>
        <Text style={styles.row}>총 거리 {weeklySummary.districtBattle.totalDistanceKm}km</Text>
        <Text style={styles.row}>참여율 {weeklySummary.districtBattle.participationRate}%</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '800', color: '#101828' },
  row: { color: '#344054', paddingVertical: 8, fontWeight: '600' },
});
