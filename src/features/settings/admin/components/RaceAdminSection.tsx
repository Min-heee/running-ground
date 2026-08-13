import { memo, useCallback, useMemo, useState } from 'react';
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
  FormGrid,
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

const raceEventKeyExtractor = (event: AdminOfflineRaceEvent) => event.id;

type RaceFormFieldHandlers = Record<keyof RaceFormState, (value: string) => void>;

const RaceEventRow = memo(function RaceEventRow({
  event,
  onDelete,
  onEdit,
  submitting,
}: {
  event: AdminOfflineRaceEvent;
  onDelete: (event: AdminOfflineRaceEvent) => void;
  onEdit: (event: AdminOfflineRaceEvent) => void;
  submitting: boolean;
}) {
  const handleEdit = useCallback(() => onEdit(event), [event, onEdit]);
  const handleDelete = useCallback(() => onDelete(event), [event, onDelete]);
  // 레이스 명단 (오너 2026-08-13): 행마다 접었다 펴는 신청자 목록 — 이름 (태그), 이름 미해석은 태그만.
  const [rosterOpen, setRosterOpen] = useState(false);
  const registrants = event.registrants ?? [];
  const handleToggleRoster = useCallback(() => setRosterOpen((current) => !current), []);

  return (
    <View style={styles.listCard}>
      <View style={styles.listHeader}>
        <View style={styles.listHeaderTextWrap}>
          <Text style={styles.listTitle}>{event.title}</Text>
          <Text style={styles.listMeta}>
            {event.distanceKm}km · {event.status} · {event.participantCount}/{event.capacity}명
          </Text>
        </View>
        <View style={styles.inlineActions}>
          <ActionButton
            label={rosterOpen ? '명단 접기' : `명단 ${registrants.length}명`}
            variant="secondary"
            onPress={handleToggleRoster}
            disabled={registrants.length === 0}
          />
          <ActionButton label="편집" variant="secondary" onPress={handleEdit} disabled={submitting} />
          <ActionButton label="삭제" variant="danger" onPress={handleDelete} disabled={submitting} />
        </View>
      </View>
      <Text style={styles.listInfo}>출발 {formatDateTime(event.startsAt)} · 마감 {formatDateTime(event.registrationClosesAt)}</Text>
      <Text style={styles.listInfo}>{event.participationMode} · {event.proofMethod}</Text>
      <Text style={styles.listInfo}>{event.operationNote}</Text>
      {rosterOpen ? (
        <View style={styles.rosterList}>
          {registrants.map((registrant, index) => (
            <Text key={registrant.tag} style={styles.listInfo}>
              {index + 1}. {registrant.name ? `${registrant.name} (${registrant.tag})` : registrant.tag}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
});

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
  const raceFormHandlers = useMemo<RaceFormFieldHandlers>(() => ({
    title: (value) => setRaceForm((current) => ({ ...current, title: value })),
    subtitle: (value) => setRaceForm((current) => ({ ...current, subtitle: value })),
    distanceKm: (value) => setRaceForm((current) => ({ ...current, distanceKm: value })),
    startsAt: (value) => setRaceForm((current) => ({ ...current, startsAt: value })),
    registrationClosesAt: (value) => setRaceForm((current) => ({ ...current, registrationClosesAt: value })),
    participationMode: (value) => setRaceForm((current) => ({ ...current, participationMode: value })),
    proofMethod: (value) => setRaceForm((current) => ({ ...current, proofMethod: value })),
    runWindowMinutes: (value) => setRaceForm((current) => ({ ...current, runWindowMinutes: value })),
    hostLabel: (value) => setRaceForm((current) => ({ ...current, hostLabel: value })),
    capacity: (value) => setRaceForm((current) => ({ ...current, capacity: value })),
    entryFeePoints: (value) => setRaceForm((current) => ({ ...current, entryFeePoints: value })),
    operationNote: (value) => setRaceForm((current) => ({ ...current, operationNote: value })),
  }), [setRaceForm]);
  const handleCancelEdit = useCallback(() => {
    setEditingRaceEventId(null);
    setRaceForm(createEmptyRaceForm());
  }, [setEditingRaceEventId, setRaceForm]);
  const handleAllFilter = useCallback(() => setRaceFilter('all'), [setRaceFilter]);
  const handleActiveFilter = useCallback(() => setRaceFilter('active'), [setRaceFilter]);
  const handleFinishedFilter = useCallback(() => setRaceFilter('finished'), [setRaceFilter]);
  const handleEditRace = useCallback((event: AdminOfflineRaceEvent) => {
    setEditingRaceEventId(event.id);
    setRaceForm(toRaceForm(event));
  }, [setEditingRaceEventId, setRaceForm]);
  const renderRaceEvent = useCallback((event: AdminOfflineRaceEvent) => (
    <RaceEventRow
      event={event}
      onDelete={handleDeleteRace}
      onEdit={handleEditRace}
      submitting={submitting}
    />
  ), [handleDeleteRace, handleEditRace, submitting]);

  return (
    <Card>
      <Text style={styles.sectionTitle}>레이스 관리</Text>
      <Text style={styles.sectionDescription}>날짜별 레이스 일정과 정원, 접수 마감, 운영 메모를 바로 수정해요.</Text>
      <FormGrid isMedium={isMedium}>
        <Field label="레이스 이름" value={raceForm.title} onChangeText={raceFormHandlers.title} placeholder="한강 나이트 런" />
        <Field label="한 줄 설명" value={raceForm.subtitle} onChangeText={raceFormHandlers.subtitle} placeholder="오후 8시 각자 출발" />
        <Field label="거리(km)" value={raceForm.distanceKm} onChangeText={raceFormHandlers.distanceKm} placeholder="10" />
        <Field label="출발 일시" value={raceForm.startsAt} onChangeText={raceFormHandlers.startsAt} placeholder="2026-04-18T20:00" />
        <Field label="접수 마감" value={raceForm.registrationClosesAt} onChangeText={raceFormHandlers.registrationClosesAt} placeholder="2026-04-18T19:00" />
        <Field label="운영 방식" value={raceForm.participationMode} onChangeText={raceFormHandlers.participationMode} />
        <Field label="인증 방식" value={raceForm.proofMethod} onChangeText={raceFormHandlers.proofMethod} />
        <Field label="진행 시간(분)" value={raceForm.runWindowMinutes} onChangeText={raceFormHandlers.runWindowMinutes} />
        <Field label="운영 주체" value={raceForm.hostLabel} onChangeText={raceFormHandlers.hostLabel} />
        <Field label="정원" value={raceForm.capacity} onChangeText={raceFormHandlers.capacity} />
        <Field label="참가 포인트" value={raceForm.entryFeePoints} onChangeText={raceFormHandlers.entryFeePoints} />
        <View style={styles.formGridFull}>
          <Field
            label="운영 메모"
            value={raceForm.operationNote}
            onChangeText={raceFormHandlers.operationNote}
            multiline
          />
        </View>
      </FormGrid>
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
            onPress={handleCancelEdit}
            disabled={submitting}
          />
        ) : null}
      </View>
      <View style={styles.listControls}>
        <SearchInput value={raceQuery} onChangeText={setRaceQuery} placeholder="레이스명, 운영 주체, 인증 방식으로 검색" />
        <View style={styles.toggleRow}>
          <ToggleChip label="전체" active={raceFilter === 'all'} onPress={handleAllFilter} />
          <ToggleChip label="진행/예정" active={raceFilter === 'active'} onPress={handleActiveFilter} />
          <ToggleChip label="종료" active={raceFilter === 'finished'} onPress={handleFinishedFilter} />
        </View>
        <Text style={styles.filterSummary}>검색 결과 {filteredRaceEvents.length} / 전체 {raceEvents.length}</Text>
      </View>
      <AdminList
        data={filteredRaceEvents}
        emptyText="등록된 오프라인 레이스가 아직 없어요."
        keyExtractor={raceEventKeyExtractor}
        renderItem={renderRaceEvent}
      />
    </Card>
  );
}
