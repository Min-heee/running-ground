import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import { weeklySummary, connectedSources, myProfile } from '@/data/mock';
import { IntegrationStatus } from '@/features/integrations/IntegrationStatus';
import { PageHeader } from '@/components/ui/PageHeader';
import { ListRow } from '@/components/ui/ListRow';

export default function MyPageScreen() {
  const connectedCount = connectedSources.filter((source) => source.connected).length;

  return (
    <Screen>
      <PageHeader title="마이페이지" subtitle="내 프로필, 활동 요약, 연동 상태와 설정을 한 번에 관리." />

      <Card style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>민</Text>
        </View>
        <View style={styles.profileMeta}>
          <Text style={styles.name}>{myProfile.name}</Text>
          <Text style={styles.subline}>{myProfile.districtName} · 러닝 경쟁 진행 중</Text>
          <Text style={styles.tag}>{myProfile.publicTag}</Text>
        </View>
      </Card>

      <View style={styles.profileActions}>
        <Pressable style={styles.primaryAction}>
          <Text style={styles.primaryActionText}>프로필 수정</Text>
        </Pressable>
        <Pressable style={styles.secondaryAction}>
          <Text style={styles.secondaryActionText}>내 태그 공유</Text>
        </Pressable>
      </View>

      <Card>
        <SectionTitle>내 활동</SectionTitle>
        <View style={styles.metricRow}>
          <View style={styles.metricBox}>
            <Text style={styles.metricValue}>{weeklySummary.totalDistanceKm}km</Text>
            <Text style={styles.metricLabel}>이번 주 거리</Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricValue}>{weeklySummary.districtPoints}P</Text>
            <Text style={styles.metricLabel}>포인트</Text>
          </View>
        </View>
      </Card>

      <Card>
        <SectionTitle>연동 요약</SectionTitle>
        <ListRow>{`현재 연결된 기록 소스 ${connectedCount}개`}</ListRow>
        <ListRow>{`최근 반영 기록 ${weeklySummary.latestRun.distanceKm}km`}</ListRow>
      </Card>

      <IntegrationStatus sources={connectedSources} />

      <Card>
        <SectionTitle>계정 관리</SectionTitle>
        <ListRow>계정 정보</ListRow>
        <ListRow>비밀번호 변경</ListRow>
        <ListRow>핸드폰번호 관리</ListRow>
      </Card>

      <Card>
        <SectionTitle>앱 설정</SectionTitle>
        <ListRow>지역 설정</ListRow>
        <ListRow>알림 설정</ListRow>
        <ListRow>기록 연동 관리</ListRow>
        <ListRow>친구 태그 관리</ListRow>
      </Card>

      <Pressable style={styles.logoutButton}>
        <Text style={styles.logoutButtonText}>로그아웃</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 99,
    backgroundColor: '#6D5EF7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  profileMeta: { gap: 4 },
  name: {
    fontSize: 24,
    fontWeight: '800',
    color: '#101828',
  },
  subline: {
    color: '#667085',
  },
  tag: {
    color: '#6D5EF7',
    fontWeight: '800',
    marginTop: 2,
  },
  profileActions: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryAction: {
    flex: 1,
    backgroundColor: '#6D5EF7',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  secondaryAction: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D0D5DD',
  },
  secondaryActionText: {
    color: '#111827',
    fontWeight: '700',
  },
  metricRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricBox: {
    flex: 1,
    backgroundColor: '#F2F4F7',
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  metricLabel: {
    color: '#667085',
  },
  logoutButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F04438',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#F04438',
    fontWeight: '800',
  },
});
