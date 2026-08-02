import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fixedColors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

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
    setSavedMessage('자신과 대결 기록으로 저장했어요!');
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
      <Text style={styles.title}>방금 러닝을 대결 기록으로 저장할까요?</Text>
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

// 러닝 탭 개편 전에는 어두운 크롬 위에 떠서 고정 흰색이었지만, 지금은 밝은 앱 배경 위라
// 흰 글씨가 안 보였다 (오너 2026-08-02) — 테마 토큰 서피스 카드로 재도색.
const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.cardEdge,
    borderRadius: radii.xl,
    borderWidth: 1,
    gap: spacing.s10,
    padding: spacing.s16,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.extraBold,
  },
  summary: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  savedText: {
    color: colors.successStrong,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
  slotList: {
    gap: spacing.sm,
  },
  slotHint: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
  slotRow: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.sm,
  },
  slotRowText: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  slotRowAction: {
    color: colors.brand,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexGrow: 1,
    paddingVertical: spacing.s10,
  },
  saveButton: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  saveButtonText: {
    color: fixedColors.white,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
  },
  skipButtonText: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
  },
});
