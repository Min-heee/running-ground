import type { MatchSlotOption } from '@/features/runs/utils/matchScheduling';

export function findMatchSlotByStartAt(
  slotOptions: MatchSlotOption[],
  selectedSlotStartAt: string,
): MatchSlotOption | null {
  const selectedSlotStartMs = new Date(selectedSlotStartAt).getTime();

  return slotOptions.find((slot) => new Date(slot.startsAt).getTime() === selectedSlotStartMs) ?? null;
}
