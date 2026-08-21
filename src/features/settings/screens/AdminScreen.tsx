import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Card } from '@/components/Card';
import { ActionButton, Field, MetricCard } from '@/features/settings/admin/components/AdminPrimitives';
import { MarketAdminSection } from '@/features/settings/admin/components/MarketAdminSection';
import { NoticeAdminSection } from '@/features/settings/admin/components/NoticeAdminSection';
import { RaceAdminSection } from '@/features/settings/admin/components/RaceAdminSection';
import { RedemptionAdminSection } from '@/features/settings/admin/components/RedemptionAdminSection';
import { UserAdminSection } from '@/features/settings/admin/components/UserAdminSection';
import { styles } from '@/features/settings/admin/components/adminStyles';
import { useAdminDashboard } from '@/features/settings/admin/hooks/useAdminDashboard';
import { colors } from '@/theme/tokens';

export default function AdminScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 1100;
  const isMedium = width >= 720;
  const {
    adminSession,
    adminTokenInput,
    apiBaseUrl,
    authReady,
    editingMarketItemId,
    editingNoticeId,
    editingRaceEventId,
    error,
    filteredMarketItems,
    filteredNotices,
    filteredRaceEvents,
    filteredRewardRedemptions,
    filteredUsers,
    handleAdminLogin,
    handleAdminLogout,
    handleDeleteMarket,
    handleDeleteNotice,
    handleDeleteRace,
    handleDeleteUser,
    handleSubmitMarket,
    handleSubmitNotice,
    handleSubmitRace,
    handleUpdateRedemption,
    isAuthenticated,
    loadDashboard,
    loading,
    marketFilter,
    marketForm,
    marketItems,
    marketQuery,
    message,
    noticeFilter,
    noticeForm,
    noticeQuery,
    notices,
    overview,
    raceEvents,
    raceFilter,
    raceForm,
    raceQuery,
    redemptionFilter,
    redemptionNotesById,
    redemptionQuery,
    rewardRedemptions,
    setAdminTokenInput,
    setEditingMarketItemId,
    setEditingNoticeId,
    setEditingRaceEventId,
    setMarketFilter,
    setMarketForm,
    setMarketQuery,
    setNoticeFilter,
    setNoticeForm,
    setNoticeQuery,
    setRaceFilter,
    setRaceForm,
    setRaceQuery,
    setRedemptionFilter,
    setRedemptionNotesById,
    setRedemptionQuery,
    setUserQuery,
    submitting,
    userQuery,
    users,
  } = useAdminDashboard();

  return (
    <View style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.container, isWide ? styles.containerWide : null]}>
          <View style={styles.hero}>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>RunningSpace ADMIN</Text>
            </View>
            <Text style={styles.heroTitle}>운영 관리 웹</Text>
            <Text style={styles.heroSubtitle}>
              회원 관리, 레이스 운영, 마켓 상품과 재고를 한 곳에서 바로 관리할 수 있게 묶었어요.
            </Text>
            <Text style={styles.heroMeta}>현재 API 주소 · {apiBaseUrl}</Text>
            {Platform.OS !== 'web' ? (
              <Text style={styles.platformHint}>이 화면은 웹에서 가장 편하게 쓰도록 맞춰뒀어요.</Text>
            ) : null}
          </View>

          {!authReady || (loading && !isAuthenticated) ? (
            <Card>
              <Text style={styles.sectionTitle}>관리자 로그인 확인</Text>
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.textPrimary} />
                <Text style={styles.loadingText}>저장된 관리자 로그인 상태를 확인하는 중이에요.</Text>
              </View>
            </Card>
          ) : !isAuthenticated ? (
            <Card>
              <Text style={styles.sectionTitle}>관리자 로그인</Text>
              <Text style={styles.sectionDescription}>
                관리자 토큰을 입력하면 운영 대시보드가 열려요. 웹에서는 마지막 토큰을 브라우저에 기억해둬요.
              </Text>
              <View style={[styles.row, isMedium ? styles.rowInline : null]}>
                <View style={styles.flexField}>
                  <Field
                    label="관리자 토큰"
                    value={adminTokenInput}
                    onChangeText={setAdminTokenInput}
                    placeholder="preview-admin-..."
                  />
                </View>
                <View style={styles.tokenActions}>
                  <ActionButton label="로그인" onPress={() => void handleAdminLogin()} disabled={loading || submitting} />
                </View>
              </View>
              {loading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={colors.textPrimary} />
                  <Text style={styles.loadingText}>관리자 로그인 확인 중이에요.</Text>
                </View>
              ) : null}
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              {message ? <Text style={styles.successText}>{message}</Text> : null}
            </Card>
          ) : (
            <>
              <Card>
                <Text style={styles.sectionTitle}>관리자 세션</Text>
                <Text style={styles.sectionDescription}>
                  로그인된 상태예요. 필요할 때 새로고침하거나 로그아웃해서 다른 관리자 토큰으로 다시 들어올 수 있어요.
                </Text>
                <Text style={styles.overviewMeta}>
                  환경 · {adminSession?.environment ?? 'unknown'}
                  {adminSession?.publicBaseUrl ? `  |  Public URL · ${adminSession.publicBaseUrl}` : ''}
                </Text>
                <View style={styles.actionRow}>
                  <ActionButton label="대시보드 새로고침" onPress={() => void loadDashboard()} disabled={loading || submitting} />
                  <ActionButton label="로그아웃" variant="secondary" onPress={handleAdminLogout} disabled={loading || submitting} />
                </View>
                {loading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color={colors.textPrimary} />
                    <Text style={styles.loadingText}>관리자 데이터를 불러오는 중이에요.</Text>
                  </View>
                ) : null}
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
                {message ? <Text style={styles.successText}>{message}</Text> : null}
              </Card>

              <Card>
                <Text style={styles.sectionTitle}>운영 요약</Text>
                <View style={[styles.metricGrid, isWide ? styles.metricGridWide : null]}>
                  <MetricCard label="회원" value={overview?.counts.users ?? 0} />
                  <MetricCard label="기록" value={overview?.counts.runs ?? 0} />
                  <MetricCard label="마켓 상품" value={overview?.counts.marketItems ?? 0} />
                  <MetricCard label="활성 상품" value={overview?.counts.activeMarketItems ?? 0} />
                  <MetricCard label="공지" value={overview?.counts.notices ?? 0} />
                  <MetricCard label="활성 공지" value={overview?.counts.activeNotices ?? 0} />
                  <MetricCard label="레이스" value={overview?.counts.offlineRaceEvents ?? 0} />
                  <MetricCard label="진행/예정 레이스" value={overview?.counts.activeOfflineRaceEvents ?? 0} />
                  <MetricCard label="리워드 교환" value={overview?.counts.rewardRedemptions ?? 0} />
                  <MetricCard label="활성 세션" value={overview?.counts.sessions ?? 0} />
                </View>
                <Text style={styles.overviewMeta}>
                  환경 · {overview?.environment ?? 'unknown'}
                  {overview?.publicBaseUrl ? `  |  Public URL · ${overview.publicBaseUrl}` : ''}
                </Text>
              </Card>

              <View style={[styles.dashboardGrid, isWide ? styles.dashboardGridWide : null]}>
                <View style={styles.primaryColumn}>
                  <NoticeAdminSection
                    editingNoticeId={editingNoticeId}
                    filteredNotices={filteredNotices}
                    handleDeleteNotice={handleDeleteNotice}
                    handleSubmitNotice={handleSubmitNotice}
                    loading={loading}
                    noticeFilter={noticeFilter}
                    noticeForm={noticeForm}
                    noticeQuery={noticeQuery}
                    notices={notices}
                    setEditingNoticeId={setEditingNoticeId}
                    setNoticeFilter={setNoticeFilter}
                    setNoticeForm={setNoticeForm}
                    setNoticeQuery={setNoticeQuery}
                    submitting={submitting}
                  />
                  <UserAdminSection
                    filteredUsers={filteredUsers}
                    handleDeleteUser={handleDeleteUser}
                    setUserQuery={setUserQuery}
                    submitting={submitting}
                    userQuery={userQuery}
                    users={users}
                  />
                  <MarketAdminSection
                    editingMarketItemId={editingMarketItemId}
                    filteredMarketItems={filteredMarketItems}
                    handleDeleteMarket={handleDeleteMarket}
                    handleSubmitMarket={handleSubmitMarket}
                    isMedium={isMedium}
                    loading={loading}
                    marketFilter={marketFilter}
                    marketForm={marketForm}
                    marketItems={marketItems}
                    marketQuery={marketQuery}
                    setEditingMarketItemId={setEditingMarketItemId}
                    setMarketFilter={setMarketFilter}
                    setMarketForm={setMarketForm}
                    setMarketQuery={setMarketQuery}
                    submitting={submitting}
                  />
                </View>

                <View style={styles.secondaryColumn}>
                  <RedemptionAdminSection
                    filteredRewardRedemptions={filteredRewardRedemptions}
                    handleUpdateRedemption={handleUpdateRedemption}
                    redemptionFilter={redemptionFilter}
                    redemptionNotesById={redemptionNotesById}
                    redemptionQuery={redemptionQuery}
                    rewardRedemptions={rewardRedemptions}
                    setRedemptionFilter={setRedemptionFilter}
                    setRedemptionNotesById={setRedemptionNotesById}
                    setRedemptionQuery={setRedemptionQuery}
                    submitting={submitting}
                  />
                  <RaceAdminSection
                    editingRaceEventId={editingRaceEventId}
                    filteredRaceEvents={filteredRaceEvents}
                    handleDeleteRace={handleDeleteRace}
                    handleSubmitRace={handleSubmitRace}
                    isMedium={isMedium}
                    loading={loading}
                    raceEvents={raceEvents}
                    raceFilter={raceFilter}
                    raceForm={raceForm}
                    raceQuery={raceQuery}
                    setEditingRaceEventId={setEditingRaceEventId}
                    setRaceFilter={setRaceFilter}
                    setRaceForm={setRaceForm}
                    setRaceQuery={setRaceQuery}
                    submitting={submitting}
                  />
                </View>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
