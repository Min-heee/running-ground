import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  formatGhostDate,
  formatGhostDistance,
  formatGhostDuration,
  formatGhostPace,
} from './ghostDisplay';
import {
  clearPendingGhostCandidate,
  getPendingGhostCandidate,
  subscribePendingGhostCandidate,
} from './ghostRecorder';
import { GHOST_SLOT_COUNT, loadGhostSlots, saveGhostToSlot } from './ghostStorage';
import type { GhostRecord } from './ghostTrackCodec';

// "방금 러닝을 나와의 대결 기록으로 저장할까요?" — appears on the run tab's
// ready card whenever a finished solo run produced a ghost candidate. Max 3
// slots; when all are full the user picks which one to replace.
export function GhostSavePromptCard() {
  const [candidate, setCandidate] = useState<GhostRecord | null>(() => getPendingGhostCandidate());
  const [slots, setSlots] = useState<(GhostRecord | null)[] | null>(null);
  const [choosingSlot, setChoosingSlot] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => subscribePendingGhostCandidate(() => {
    const next = getPendingGhostCandidate();
    setCandidate(next);
    setChoosingSlot(false);
    if (next) {
      setSavedMessage(null);
      void loadGhostSlots().then(setSlots);
    }
  }), []);

  useEffect(() => {
    if (candidate) {
      void loadGhostSlots().then(setSlots);
    }
  }, [candidate]);

  const persistToSlot = useCallback(async (slot: number) => {
    if (!candidate) {
      return;
    }

    await saveGhostToSlot(slot, candidate);
    clearPendingGhostCandidate();
    setSavedMessage('나와의 대결 기록으로 저장했어요!');
  }, [candidate]);

  const handleSave = useCallback(() => {
    if (!candidate || !slots) {
      return;
    }

    const emptySlot = slots.findIndex((entry) => entry === null);
    if (emptySlot !== -1) {
      void persistToSlot(emptySlot);
      return;
    }

    // All 3 full → let the user pick which record to replace.
    setChoosingSlot(true);
  }, [candidate, persistToSlot, slots]);

  if (savedMessage) {
    return (
      <View style={styles.card}>
        <Text style={styles.savedText}>{savedMessage}</Text>
      </View>
    );
  }

  if (!candidate) {
    return null;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>👻 방금 러닝을 대결 기록으로 저장할까요?</Text>
      <Text style={styles.summary}>
        {formatGhostDistance(candidate)} · {formatGhostDuration(candidate)} · {formatGhostPace(candidate)}
      </Text>

      {choosingSlot && slots ? (
        <View style={styles.slotList}>
          <Text style={styles.slotHint}>저장 공간이 가득 찼어요. 바꿀 기록을 골라주세요.</Text>
          {slots.map((slot, index) => (
            <Pressable
              key={index}
              style={styles.slotRow}
              onPress={() => void persistToSlot(index)}
              accessibilityRole="button"
            >
              <Text style={styles.slotRowText}>
                {slot
                  ? `${formatGhostDate(slot)} · ${formatGhostDistance(slot)} · ${formatGhostDuration(slot)}`
                  : '빈 슬롯'}
              </Text>
              <Text style={styles.slotRowAction}>교체</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        {!choosingSlot ? (
          <Pressable style={[styles.actionButton, styles.saveButton]} onPress={handleSave} accessibilityRole="button">
            <Text style={styles.saveButtonText}>저장하기 (최대 {GHOST_SLOT_COUNT}개)</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={styles.actionButton}
          onPress={() => clearPendingGhostCandidate()}
          accessibilityRole="button"
        >
          <Text style={styles.skipButtonText}>건너뛰기</Text>
        </Pressable>
      </View>
    </View>
  );
}

// The ready card sits on the fixed dark chrome — style with fixed colors.
const styles = StyleSheet.create({
  card: {
    borderColor: 'rgba(255, 255, 255, 0.28)',
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  summary: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 13,
    fontWeight: '600',
  },
  savedText: {
    color: '#7BD88F',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  slotList: {
    gap: 6,
  },
  slotHint: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 12,
  },
  slotRow: {
    alignItems: 'center',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  slotRowText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  slotRowAction: {
    color: '#A6B7FF',
    fontSize: 12,
    fontWeight: '800',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    alignItems: 'center',
    borderColor: 'rgba(255, 255, 255, 0.28)',
    borderRadius: 999,
    borderWidth: 1,
    flexGrow: 1,
    paddingVertical: 9,
  },
  saveButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  skipButtonText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
    fontWeight: '700',
  },
});
