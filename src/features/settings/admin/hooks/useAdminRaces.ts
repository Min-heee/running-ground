import { useMemo, useState } from 'react';
import {
  createAdminOfflineRaceEvent,
  deleteAdminOfflineRaceEvent,
  updateAdminOfflineRaceEvent,
} from '@/services/adminService';
import type { AdminOfflineRaceEvent } from '@/lib/api/types';
import type { AdminDashboardDomainContext, RaceFormState } from '@/features/settings/admin/types';
import {
  confirmAction,
  createEmptyRaceForm,
  filterAdminRaceEvents,
} from '@/features/settings/admin/utils/adminDashboardUtils';

// Offline-race domain slice of the admin dashboard. State + handlers only; loading the
// initial list stays in the useAdminDashboard composer (setRaceEvents is exposed for it).
export function useAdminRaces({ adminToken, withSubmission, refreshOverview, setMessage }: AdminDashboardDomainContext) {
  const [raceEvents, setRaceEvents] = useState<AdminOfflineRaceEvent[]>([]);
  const [raceQuery, setRaceQuery] = useState('');
  const [raceFilter, setRaceFilter] = useState<'all' | 'active' | 'finished'>('all');
  const [raceForm, setRaceForm] = useState<RaceFormState>(createEmptyRaceForm);
  const [editingRaceEventId, setEditingRaceEventId] = useState<string | null>(null);

  const handleSubmitRace = () => {
    void withSubmission(async () => {
      const payload = {
        title: raceForm.title,
        subtitle: raceForm.subtitle,
        distanceKm: Number(raceForm.distanceKm),
        startsAt: raceForm.startsAt,
        registrationClosesAt: raceForm.registrationClosesAt,
        participationMode: raceForm.participationMode,
        proofMethod: raceForm.proofMethod,
        runWindowMinutes: Number(raceForm.runWindowMinutes),
        hostLabel: raceForm.hostLabel,
        capacity: Number(raceForm.capacity),
        entryFeePoints: Number(raceForm.entryFeePoints),
        operationNote: raceForm.operationNote,
      };

      const result = editingRaceEventId
        ? await updateAdminOfflineRaceEvent(adminToken, editingRaceEventId, payload)
        : await createAdminOfflineRaceEvent(adminToken, payload);

      setRaceEvents(result.events);
      setEditingRaceEventId(null);
      setRaceForm(createEmptyRaceForm());
      await refreshOverview(adminToken);
      setMessage(editingRaceEventId ? '레이스를 수정했어요.' : '새 레이스를 추가했어요.');
    });
  };

  const handleDeleteRace = (event: AdminOfflineRaceEvent) => {
    if (!confirmAction(`${event.title} 레이스를 삭제할까요?`)) {
      return;
    }

    void withSubmission(async () => {
      const result = await deleteAdminOfflineRaceEvent(adminToken, event.id);
      setRaceEvents(result.events);
      if (editingRaceEventId === event.id) {
        setEditingRaceEventId(null);
        setRaceForm(createEmptyRaceForm());
      }
      await refreshOverview(adminToken);
      setMessage(`${event.title} 레이스를 삭제했어요.`);
    });
  };

  const filteredRaceEvents = useMemo(
    () => filterAdminRaceEvents(raceEvents, raceQuery, raceFilter),
    [raceEvents, raceFilter, raceQuery],
  );

  return {
    editingRaceEventId,
    filteredRaceEvents,
    handleDeleteRace,
    handleSubmitRace,
    raceEvents,
    raceFilter,
    raceForm,
    raceQuery,
    setEditingRaceEventId,
    setRaceEvents,
    setRaceFilter,
    setRaceForm,
    setRaceQuery,
  };
}
