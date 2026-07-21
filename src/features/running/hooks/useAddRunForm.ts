import { useState } from 'react';
import { router } from 'expo-router';
import { createManualRun, getApiErrorMessage } from '@/services';
import { validateManualRunInput } from '@/features/running/utils/runRecordValidation';

export function getTodayDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function useAddRunForm() {
  const [date, setDate] = useState(getTodayDateValue());
  const [distanceKm, setDistanceKm] = useState('');
  const [pace, setPace] = useState('06:00/km');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const validation = validateManualRunInput({
      date,
      distanceKmText: distanceKm,
      pace,
    });

    if (!validation.valid) {
      setError(validation.message);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const createdRun = await createManualRun({
        date: validation.value.date,
        distanceKm: validation.value.distanceKm,
        pace: validation.value.pace,
      });

      router.replace({
        pathname: '/run-detail',
        params: {
          runId: createdRun.run.id,
        },
      });
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, '러닝 기록 저장에 실패했어요.'));
    } finally {
      setSubmitting(false);
    }
  };

  const resetDateToToday = () => setDate(getTodayDateValue());

  return {
    date,
    distanceKm,
    error,
    handleSubmit,
    pace,
    resetDateToToday,
    setDate,
    setDistanceKm,
    setPace,
    submitting,
  };
}
