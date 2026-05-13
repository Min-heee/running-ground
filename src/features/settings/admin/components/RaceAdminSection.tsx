import type { Dispatch, SetStateAction } from 'react';
import { Text, View } from 'react-native';
import { Card } from '@/components/Card';
import type { AdminOfflineRaceEvent } from '@/lib/api/types';
import type { RaceFormState } from '@/features/settings/admin/types';
import {
  createEmptyRaceForm,
  formatDateTime,
  toRaceForm,
} from '@/features/settings/admin/utils/adminDashboardUtils';
import {
  ActionButton,
  AdminList,
  Field,
  SearchInput,
  ToggleChip,
} from './AdminPrimitives';
import { styles } from './adminStyles';

type RaceFilter = 'all' | 'active' | 'finished';

type RaceAdminSectionProps = {
  editingRaceEventId: string | null;
  filteredRaceEvents: AdminOfflineRaceEvent[];
  handleDeleteRace: (event: AdminOfflineRaceEvent) => void;
  handleSubmitRace: () => void;
  isMedium: boolean;
  loading: boolean;
  raceEvents: AdminOfflineRaceEvent[];
  raceFilter: RaceFilter;
  raceForm: RaceFormState;
  raceQuery: string;
  setEditingRaceEventId: Dispatch<SetStateAction<string | null>>;
  setRaceFilter: Dispatch<SetStateAction<RaceFilter>>;
  setRaceForm: Dispatch<SetStateAction<RaceFormState>>;
  setRaceQuery: Dispatch<SetStateAction<string>>;
  submitting: boolean;
};

export function RaceAdminSection({
  editingRaceEventId,
  filteredRaceEvents,
  handleDeleteRace,
  handleSubmitRace,
  isMedium,
  loading,
  raceEvents,
  raceFilter,
  raceForm,
  raceQuery,
  setEditingRaceEventId,
  setRaceFilter,
  setRaceForm,
  setRaceQuery,
  submitting,
}: RaceAdminSectionProps) {
  return (
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
      <AdminList
        data={filteredRaceEvents}
        emptyText="등록된 오프라인 레이스가 아직 없어요."
        keyExtractor={(event) => event.id}
        renderItem={(event) => (
          <View style={styles.listCard}>
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
        )}
      />
    </Card>
  );
}
