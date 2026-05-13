import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Card } from '@/components/Card';
import { useAdminDashboard } from '@/features/settings/admin/hooks/useAdminDashboard';
import {
  createEmptyMarketForm,
  createEmptyNoticeForm,
  createEmptyRaceForm,
  formatDateTime,
  getRewardStatusLabel,
  toMarketForm,
  toNoticeForm,
  toRaceForm,
} from '@/features/settings/admin/utils/adminDashboardUtils';

function ToggleChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.toggleChip, active ? styles.toggleChipActive : null]} onPress={onPress}>
      <Text style={[styles.toggleChipText, active ? styles.toggleChipTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function ActionButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[
        styles.actionButton,
        variant === 'secondary' ? styles.actionButtonSecondary : null,
        variant === 'danger' ? styles.actionButtonDanger : null,
        disabled ? styles.actionButtonDisabled : null,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text
        style={[
          styles.actionButtonText,
          variant === 'secondary' ? styles.actionButtonTextSecondary : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline ? styles.textArea : null]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#98A2B3"
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

function SearchInput({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
}) {
  return (
    <TextInput
      style={styles.searchInput}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#98A2B3"
    />
  );
}

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
              <Text style={styles.heroBadgeText}>RunningGround ADMIN</Text>
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
                <ActivityIndicator color="#111827" />
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
                  <ActivityIndicator color="#111827" />
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
                    <ActivityIndicator color="#111827" />
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
              <Card>
                <Text style={styles.sectionTitle}>공지 관리</Text>
                <Text style={styles.sectionDescription}>운영 공지를 올리면 홈 화면 상단에 바로 노출돼요.</Text>
                <View style={styles.formGrid}>
                  <Field
                    label="공지 제목"
                    value={noticeForm.title}
                    onChangeText={(value) => setNoticeForm((current) => ({ ...current, title: value }))}
                    placeholder="이번 주 레이스 접수 시작"
                  />
                  <Field
                    label="공지 내용"
                    value={noticeForm.message}
                    onChangeText={(value) => setNoticeForm((current) => ({ ...current, message: value }))}
                    placeholder="홈 상단에 보여줄 짧고 명확한 안내를 적어주세요."
                    multiline
                  />
                  <Field
                    label="우선순위"
                    value={noticeForm.priority}
                    onChangeText={(value) => setNoticeForm((current) => ({ ...current, priority: value }))}
                    placeholder="0"
                  />
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>활성 상태</Text>
                    <View style={styles.toggleRow}>
                      <ToggleChip label="활성" active={noticeForm.isActive} onPress={() => setNoticeForm((current) => ({ ...current, isActive: true }))} />
                      <ToggleChip label="비활성" active={!noticeForm.isActive} onPress={() => setNoticeForm((current) => ({ ...current, isActive: false }))} />
                    </View>
                  </View>
                </View>
                <View style={styles.actionRow}>
                  <ActionButton
                    label={editingNoticeId ? '공지 수정 저장' : '공지 추가'}
                    onPress={handleSubmitNotice}
                    disabled={submitting || loading}
                  />
                  {editingNoticeId ? (
                    <ActionButton
                      label="취소"
                      variant="secondary"
                      onPress={() => {
                        setEditingNoticeId(null);
                        setNoticeForm(createEmptyNoticeForm());
                      }}
                      disabled={submitting}
                    />
                  ) : null}
                </View>
                <View style={styles.listControls}>
                  <SearchInput value={noticeQuery} onChangeText={setNoticeQuery} placeholder="공지 제목이나 내용을 검색해보세요." />
                  <View style={styles.toggleRow}>
                    <ToggleChip label="전체" active={noticeFilter === 'all'} onPress={() => setNoticeFilter('all')} />
                    <ToggleChip label="활성" active={noticeFilter === 'active'} onPress={() => setNoticeFilter('active')} />
                    <ToggleChip label="비활성" active={noticeFilter === 'inactive'} onPress={() => setNoticeFilter('inactive')} />
                  </View>
                  <Text style={styles.filterSummary}>검색 결과 {filteredNotices.length} / 전체 {notices.length}</Text>
                </View>
                <View style={styles.listStack}>
                  {filteredNotices.length === 0 ? (
                    <Text style={styles.emptyText}>등록된 공지가 아직 없어요.</Text>
                  ) : filteredNotices.map((notice) => (
                    <View key={notice.id} style={styles.listCard}>
                      <View style={styles.listHeader}>
                        <View style={styles.listHeaderTextWrap}>
                          <Text style={styles.listTitle}>{notice.title}</Text>
                          <Text style={styles.listMeta}>우선순위 {notice.priority} · {notice.isActive ? '활성' : '비활성'}</Text>
                        </View>
                        <View style={styles.inlineActions}>
                          <ActionButton label="편집" variant="secondary" onPress={() => {
                            setEditingNoticeId(notice.id);
                            setNoticeForm(toNoticeForm(notice));
                          }} disabled={submitting} />
                          <ActionButton label="삭제" variant="danger" onPress={() => handleDeleteNotice(notice)} disabled={submitting} />
                        </View>
                      </View>
                      <Text style={styles.listInfo}>{notice.message}</Text>
                      <Text style={styles.listInfo}>수정 {formatDateTime(notice.updatedAt)}</Text>
                    </View>
                  ))}
                </View>
              </Card>

              <Card>
                <Text style={styles.sectionTitle}>회원 관리</Text>
                <Text style={styles.sectionDescription}>가입한 회원과 지역, 대학, 활동량을 보고 바로 정리할 수 있어요.</Text>
                <View style={styles.listControls}>
                  <SearchInput value={userQuery} onChangeText={setUserQuery} placeholder="이름, 아이디, 태그, 지역, 대학으로 검색" />
                  <Text style={styles.filterSummary}>검색 결과 {filteredUsers.length} / 전체 {users.length}</Text>
                </View>
                <View style={styles.listStack}>
                  {filteredUsers.length === 0 ? (
                    <Text style={styles.emptyText}>아직 회원이 없어요.</Text>
                  ) : filteredUsers.map((user) => (
                    <View key={user.id} style={styles.listCard}>
                      <View style={styles.listHeader}>
                        <View style={styles.listHeaderTextWrap}>
                          <Text style={styles.listTitle}>{user.name}</Text>
                          <Text style={styles.listMeta}>@{user.username} · {user.publicTag}</Text>
                        </View>
                        <ActionButton label="삭제" variant="danger" onPress={() => handleDeleteUser(user)} disabled={submitting} />
                      </View>
                      <Text style={styles.listInfo}>
                        {user.provinceName ?? ''}{user.cityName ? ` ${user.cityName}` : ''} {user.districtName}
                        {user.universityName ? ` · ${user.universityName}` : ''}
                      </Text>
                      <Text style={styles.listInfo}>
                        누적 {user.lifetimeDistanceKm}km · 이번 주 {user.currentWeekDistanceKm}km / {user.currentWeekPoints}P · 연동 {user.connectedSourceCount}개
                      </Text>
                    </View>
                  ))}
                </View>
              </Card>

              <Card>
                <Text style={styles.sectionTitle}>마켓 관리</Text>
                <Text style={styles.sectionDescription}>상품 추가, 수정, 비활성화, 재고 관리를 여기서 바로 처리해요.</Text>
                <View style={[styles.formGrid, isMedium ? styles.formGridTwoColumns : null]}>
                  <Field label="상품명" value={marketForm.title} onChangeText={(value) => setMarketForm((current) => ({ ...current, title: value }))} />
                  <Field label="카테고리" value={marketForm.category} onChangeText={(value) => setMarketForm((current) => ({ ...current, category: value }))} />
                  <View style={styles.formGridFull}>
                    <Field
                      label="설명"
                      value={marketForm.description}
                      onChangeText={(value) => setMarketForm((current) => ({ ...current, description: value }))}
                      multiline
                    />
                  </View>
                  <Field label="필요 포인트" value={marketForm.costPoints} onChangeText={(value) => setMarketForm((current) => ({ ...current, costPoints: value }))} placeholder="60" />
                  <Field label="파트너명" value={marketForm.partnerName} onChangeText={(value) => setMarketForm((current) => ({ ...current, partnerName: value }))} placeholder="메가커피" />
                  <Field label="재고 수량" value={marketForm.inventoryCount} onChangeText={(value) => setMarketForm((current) => ({ ...current, inventoryCount: value }))} placeholder="비우면 무제한" />
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>반복 교환</Text>
                    <View style={styles.toggleRow}>
                      <ToggleChip label="1회만" active={!marketForm.repeatable} onPress={() => setMarketForm((current) => ({ ...current, repeatable: false }))} />
                      <ToggleChip label="반복 가능" active={marketForm.repeatable} onPress={() => setMarketForm((current) => ({ ...current, repeatable: true }))} />
                    </View>
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>활성 상태</Text>
                    <View style={styles.toggleRow}>
                      <ToggleChip label="활성" active={marketForm.isActive} onPress={() => setMarketForm((current) => ({ ...current, isActive: true }))} />
                      <ToggleChip label="비활성" active={!marketForm.isActive} onPress={() => setMarketForm((current) => ({ ...current, isActive: false }))} />
                    </View>
                  </View>
                </View>
                <View style={styles.actionRow}>
                  <ActionButton
                    label={editingMarketItemId ? '상품 수정 저장' : '상품 추가'}
                    onPress={handleSubmitMarket}
                    disabled={submitting || loading}
                  />
                  {editingMarketItemId ? (
                    <ActionButton
                      label="취소"
                      variant="secondary"
                      onPress={() => {
                        setEditingMarketItemId(null);
                        setMarketForm(createEmptyMarketForm());
                      }}
                      disabled={submitting}
                    />
                  ) : null}
                </View>
                <View style={styles.listControls}>
                  <SearchInput value={marketQuery} onChangeText={setMarketQuery} placeholder="상품명, 카테고리, 파트너명으로 검색" />
                  <View style={styles.toggleRow}>
                    <ToggleChip label="전체" active={marketFilter === 'all'} onPress={() => setMarketFilter('all')} />
                    <ToggleChip label="활성" active={marketFilter === 'active'} onPress={() => setMarketFilter('active')} />
                    <ToggleChip label="비활성" active={marketFilter === 'inactive'} onPress={() => setMarketFilter('inactive')} />
                  </View>
                  <Text style={styles.filterSummary}>검색 결과 {filteredMarketItems.length} / 전체 {marketItems.length}</Text>
                </View>
                <View style={styles.listStack}>
                  {filteredMarketItems.length === 0 ? (
                    <Text style={styles.emptyText}>등록된 마켓 상품이 아직 없어요.</Text>
                  ) : filteredMarketItems.map((item) => (
                    <View key={item.id} style={styles.listCard}>
                      <View style={styles.listHeader}>
                        <View style={styles.listHeaderTextWrap}>
                          <Text style={styles.listTitle}>{item.title}</Text>
                          <Text style={styles.listMeta}>{item.category} · {item.costPoints}P</Text>
                        </View>
                        <View style={styles.inlineActions}>
                          <ActionButton label="편집" variant="secondary" onPress={() => {
                            setEditingMarketItemId(item.id);
                            setMarketForm(toMarketForm(item));
                          }} disabled={submitting} />
                          <ActionButton label="삭제" variant="danger" onPress={() => handleDeleteMarket(item)} disabled={submitting} />
                        </View>
                      </View>
                      <Text style={styles.listInfo}>{item.description}</Text>
                      <Text style={styles.listInfo}>
                        {item.partnerName ? `${item.partnerName} · ` : ''}
                        {item.isActive ? '활성' : '비활성'} · {item.repeatable ? '반복 교환 가능' : '1회 교환'} · 재고 {item.remainingStock === null ? '무제한' : `${item.remainingStock}개`}
                      </Text>
                    </View>
                  ))}
                </View>
              </Card>
            </View>

            <View style={styles.secondaryColumn}>
              <Card>
                <Text style={styles.sectionTitle}>교환 관리</Text>
                <Text style={styles.sectionDescription}>누가 어떤 리워드를 신청했는지 보고, 발송 완료나 취소 상태를 바로 관리해요.</Text>
                <View style={styles.listControls}>
                  <SearchInput value={redemptionQuery} onChangeText={setRedemptionQuery} placeholder="회원명, 태그, 상품명으로 검색" />
                  <View style={styles.toggleRow}>
                    <ToggleChip label="전체" active={redemptionFilter === 'all'} onPress={() => setRedemptionFilter('all')} />
                    <ToggleChip label="요청됨" active={redemptionFilter === 'requested'} onPress={() => setRedemptionFilter('requested')} />
                    <ToggleChip label="처리 완료" active={redemptionFilter === 'fulfilled'} onPress={() => setRedemptionFilter('fulfilled')} />
                    <ToggleChip label="취소" active={redemptionFilter === 'cancelled'} onPress={() => setRedemptionFilter('cancelled')} />
                  </View>
                  <Text style={styles.filterSummary}>검색 결과 {filteredRewardRedemptions.length} / 전체 {rewardRedemptions.length}</Text>
                </View>
                <View style={styles.listStack}>
                  {filteredRewardRedemptions.length === 0 ? (
                    <Text style={styles.emptyText}>아직 들어온 리워드 교환 요청이 없어요.</Text>
                  ) : filteredRewardRedemptions.map((item) => (
                    <View key={item.id} style={styles.listCard}>
                      <View style={styles.listHeader}>
                        <View style={styles.listHeaderTextWrap}>
                          <Text style={styles.listTitle}>{item.itemTitle}</Text>
                          <Text style={styles.listMeta}>
                            {item.userName}{item.userTag ? ` · ${item.userTag}` : ''} · {item.costPoints}P
                          </Text>
                        </View>
                        <View style={[
                          styles.statusBadge,
                          item.status === 'fulfilled' ? styles.statusBadgeSuccess : null,
                          item.status === 'cancelled' ? styles.statusBadgeMuted : null,
                        ]}>
                          <Text style={[
                            styles.statusBadgeText,
                            item.status === 'fulfilled' ? styles.statusBadgeTextSuccess : null,
                            item.status === 'cancelled' ? styles.statusBadgeTextMuted : null,
                          ]}>
                            {getRewardStatusLabel(item.status)}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.listInfo}>신청 {formatDateTime(item.claimedAt)}</Text>
                      {item.fulfilledAt ? <Text style={styles.listInfo}>처리 완료 {formatDateTime(item.fulfilledAt)}</Text> : null}
                      <Field
                        label="관리 메모"
                        value={redemptionNotesById[item.id] ?? ''}
                        onChangeText={(value) => setRedemptionNotesById((current) => ({ ...current, [item.id]: value }))}
                        placeholder="발송 예정일, 취소 사유, 확인 메모를 남겨둘 수 있어요."
                        multiline
                      />
                      <View style={styles.inlineActions}>
                        <ActionButton label="요청됨" variant="secondary" onPress={() => handleUpdateRedemption(item, 'requested')} disabled={submitting} />
                        <ActionButton label="처리 완료" onPress={() => handleUpdateRedemption(item, 'fulfilled')} disabled={submitting} />
                        <ActionButton label="취소" variant="danger" onPress={() => handleUpdateRedemption(item, 'cancelled')} disabled={submitting} />
                      </View>
                    </View>
                  ))}
                </View>
              </Card>

              <Card>
                <Text style={styles.sectionTitle}>레이스 관리</Text>
                <Text style={styles.sectionDescription}>날짜별 레이스 일정과 정원, 접수 마감, 운영 메모를 바로 수정해요.</Text>
                <View style={[styles.formGrid, isMedium ? styles.formGridTwoColumns : null]}>
                  <Field label="레이스 이름" value={raceForm.title} onChangeText={(value) => setRaceForm((current) => ({ ...current, title: value }))} placeholder="한강 나이트 런" />
                  <Field label="한 줄 설명" value={raceForm.subtitle} onChangeText={(value) => setRaceForm((current) => ({ ...current, subtitle: value }))} placeholder="오후 8시 각자 출발" />
                  <Field label="거리(km)" value={raceForm.distanceKm} onChangeText={(value) => setRaceForm((current) => ({ ...current, distanceKm: value }))} placeholder="10" />
                  <Field label="출발 일시" value={raceForm.startsAt} onChangeText={(value) => setRaceForm((current) => ({ ...current, startsAt: value }))} placeholder="2026-04-18T20:00" />
                  <Field label="접수 마감" value={raceForm.registrationClosesAt} onChangeText={(value) => setRaceForm((current) => ({ ...current, registrationClosesAt: value }))} placeholder="2026-04-18T19:00" />
                  <Field label="운영 방식" value={raceForm.participationMode} onChangeText={(value) => setRaceForm((current) => ({ ...current, participationMode: value }))} />
                  <Field label="인증 방식" value={raceForm.proofMethod} onChangeText={(value) => setRaceForm((current) => ({ ...current, proofMethod: value }))} />
                  <Field label="진행 시간(분)" value={raceForm.runWindowMinutes} onChangeText={(value) => setRaceForm((current) => ({ ...current, runWindowMinutes: value }))} />
                  <Field label="운영 주체" value={raceForm.hostLabel} onChangeText={(value) => setRaceForm((current) => ({ ...current, hostLabel: value }))} />
                  <Field label="정원" value={raceForm.capacity} onChangeText={(value) => setRaceForm((current) => ({ ...current, capacity: value }))} />
                  <Field label="참가 포인트" value={raceForm.entryFeePoints} onChangeText={(value) => setRaceForm((current) => ({ ...current, entryFeePoints: value }))} />
                  <View style={styles.formGridFull}>
                    <Field
                      label="운영 메모"
                      value={raceForm.operationNote}
                      onChangeText={(value) => setRaceForm((current) => ({ ...current, operationNote: value }))}
                      multiline
                    />
                  </View>
                </View>
                <View style={styles.actionRow}>
                  <ActionButton
                    label={editingRaceEventId ? '레이스 수정 저장' : '레이스 추가'}
                    onPress={handleSubmitRace}
                    disabled={submitting || loading}
                  />
                  {editingRaceEventId ? (
                    <ActionButton
                      label="취소"
                      variant="secondary"
                      onPress={() => {
                        setEditingRaceEventId(null);
                        setRaceForm(createEmptyRaceForm());
                      }}
                      disabled={submitting}
                    />
                  ) : null}
                </View>
                <View style={styles.listControls}>
                  <SearchInput value={raceQuery} onChangeText={setRaceQuery} placeholder="레이스명, 운영 주체, 인증 방식으로 검색" />
                  <View style={styles.toggleRow}>
                    <ToggleChip label="전체" active={raceFilter === 'all'} onPress={() => setRaceFilter('all')} />
                    <ToggleChip label="진행/예정" active={raceFilter === 'active'} onPress={() => setRaceFilter('active')} />
                    <ToggleChip label="종료" active={raceFilter === 'finished'} onPress={() => setRaceFilter('finished')} />
                  </View>
                  <Text style={styles.filterSummary}>검색 결과 {filteredRaceEvents.length} / 전체 {raceEvents.length}</Text>
                </View>
                <View style={styles.listStack}>
                  {filteredRaceEvents.length === 0 ? (
                    <Text style={styles.emptyText}>등록된 오프라인 레이스가 아직 없어요.</Text>
                  ) : filteredRaceEvents.map((event) => (
                    <View key={event.id} style={styles.listCard}>
                      <View style={styles.listHeader}>
                        <View style={styles.listHeaderTextWrap}>
                          <Text style={styles.listTitle}>{event.title}</Text>
                          <Text style={styles.listMeta}>
                            {event.distanceKm}km · {event.status} · {event.participantCount}/{event.capacity}명
                          </Text>
                        </View>
                        <View style={styles.inlineActions}>
                          <ActionButton label="편집" variant="secondary" onPress={() => {
                            setEditingRaceEventId(event.id);
                            setRaceForm(toRaceForm(event));
                          }} disabled={submitting} />
                          <ActionButton label="삭제" variant="danger" onPress={() => handleDeleteRace(event)} disabled={submitting} />
                        </View>
                      </View>
                      <Text style={styles.listInfo}>출발 {formatDateTime(event.startsAt)} · 마감 {formatDateTime(event.registrationClosesAt)}</Text>
                      <Text style={styles.listInfo}>{event.participationMode} · {event.proofMethod}</Text>
                      <Text style={styles.listInfo}>{event.operationNote}</Text>
                    </View>
                  ))}
                </View>
              </Card>
                </View>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F3F5F9',
  },
  scrollContent: {
    paddingBottom: 48,
  },
  container: {
    width: '100%',
    maxWidth: 1320,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 18,
    gap: 16,
  },
  containerWide: {
    paddingHorizontal: 24,
  },
  hero: {
    backgroundColor: '#111827',
    borderRadius: 28,
    padding: 24,
    gap: 10,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#1F2937',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  heroBadgeText: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
  },
  heroSubtitle: {
    color: '#D0D5DD',
    fontSize: 15,
    lineHeight: 22,
  },
  heroMeta: {
    color: '#98A2B3',
    fontSize: 13,
    fontWeight: '600',
  },
  platformHint: {
    color: '#EDE9FE',
    fontSize: 13,
    fontWeight: '600',
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '900',
  },
  sectionDescription: {
    color: '#667085',
    lineHeight: 21,
  },
  row: {
    gap: 12,
  },
  rowInline: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  flexField: {
    flex: 1,
  },
  tokenActions: {
    minWidth: 220,
    gap: 10,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: '#475467',
    fontWeight: '600',
  },
  errorText: {
    color: '#B42318',
    fontWeight: '700',
    lineHeight: 21,
  },
  successText: {
    color: '#027A48',
    fontWeight: '700',
    lineHeight: 21,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricGridWide: {
    gap: 14,
  },
  metricCard: {
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  metricLabel: {
    color: '#667085',
    fontWeight: '700',
    fontSize: 13,
  },
  metricValue: {
    color: '#111827',
    fontWeight: '900',
    fontSize: 28,
  },
  overviewMeta: {
    color: '#667085',
    fontWeight: '600',
  },
  dashboardGrid: {
    gap: 16,
  },
  dashboardGridWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  primaryColumn: {
    flex: 1.2,
    gap: 16,
  },
  secondaryColumn: {
    flex: 1,
    gap: 16,
  },
  field: {
    gap: 8,
    minWidth: 220,
  },
  fieldLabel: {
    color: '#344054',
    fontWeight: '800',
    fontSize: 13,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: '#111827',
  },
  textArea: {
    minHeight: 100,
  },
  formGrid: {
    gap: 12,
  },
  formGridTwoColumns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  formGridFull: {
    width: '100%',
  },
  listControls: {
    gap: 10,
  },
  searchInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#111827',
  },
  filterSummary: {
    color: '#667085',
    fontSize: 13,
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  toggleChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  toggleChipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  toggleChipText: {
    color: '#344054',
    fontWeight: '700',
  },
  toggleChipTextActive: {
    color: '#FFFFFF',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  actionButton: {
    backgroundColor: '#111827',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 110,
  },
  actionButtonSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D0D5DD',
  },
  actionButtonDanger: {
    backgroundColor: '#B42318',
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  actionButtonTextSecondary: {
    color: '#111827',
  },
  listStack: {
    gap: 12,
  },
  listCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  listHeaderTextWrap: {
    flex: 1,
    gap: 4,
  },
  listTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '900',
  },
  listMeta: {
    color: '#667085',
    fontWeight: '700',
  },
  listInfo: {
    color: '#475467',
    lineHeight: 20,
  },
  inlineActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  statusBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  statusBadgeSuccess: {
    backgroundColor: '#ECFDF3',
  },
  statusBadgeMuted: {
    backgroundColor: '#F2F4F7',
  },
  statusBadgeText: {
    color: '#4338CA',
    fontWeight: '800',
    fontSize: 12,
  },
  statusBadgeTextSuccess: {
    color: '#027A48',
  },
  statusBadgeTextMuted: {
    color: '#475467',
  },
  emptyText: {
    color: '#667085',
    fontWeight: '700',
  },
});
