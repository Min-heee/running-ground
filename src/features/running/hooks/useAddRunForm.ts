import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { createManualRun } from '@/services';

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
  const trimmedDistance = useMemo(() => distanceKm.replace(',', '.').trim(), [distanceKm]);

  const handleSubmit = async () => {
    const parsedDistanceKm = Number(trimmedDistance);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('날짜는 YYYY-MM-DD 형식으로 입력해줘.');
      return;
    }

    if (!Number.isFinite(parsedDistanceKm) || parsedDistanceKm <= 0) {
      setError('거리는 0보다 큰 숫자로 입력해줘.');
      return;
    }

    if (!/^\d{1,2}:\d{2}\/km$/i.test(pace.trim())) {
      setError('페이스는 00:00/km 형식으로 입력해줘.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const createdRun = await createManualRun({
        date,
        distanceKm: parsedDistanceKm,
        pace: pace.trim(),
      });

      router.replace({
        pathname: '/run-detail',
        params: {
          runId: createdRun.run.id,
        },
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '러닝 기록 저장에 실패했어.');
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
