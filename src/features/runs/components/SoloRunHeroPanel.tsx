// 혼자 러닝의 시작 영역 (오너 2026-07-31, 시안 P).
//
// 분할 필 하나: 왼쪽(넓은 쪽)은 바로 시작, 오른쪽 작은 칸을 누르면 달리기 방식 시트가
// 올라온다(그냥 뛰기 / 페이스메이커 / 자신과 대결). 화면에는 버튼 하나만 남는 가장 컴팩트한
// 구조 — 대신 두 기능이 숨으므로 필 아래 한 줄로 존재를 알려준다.
//
// 시트는 Modal이라 배경이 반드시 불투명해야 한다(colors.surfaceChrome) — 반투명 유리 표면을
// 쓰면 밑에 깔린 화면이 비쳐 글자가 뭉개진다(토큰 주석의 네이티브 크롬 규칙).

import { memo, useCallback, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { beginRgInputTrace } from '@/utils/rgInputTrace';
import { colors, fixedColors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';

type SoloRunHeroPanelProps = {
  startLabel: string;
  startDisabled: boolean;
  onStart: () => void;
  onOpenPacemaker: () => void;
  onOpenGhostRun: () => void;
};

export const SoloRunHeroPanel = memo(function SoloRunHeroPanel({
  startLabel,
  startDisabled,
  onStart,
  onOpenPacemaker,
  onOpenGhostRun,
}: SoloRunHeroPanelProps) {
  const [sheetVisible, setSheetVisible] = useState(false);

  const handleStart = useCallback(() => {
    const trace = beginRgInputTrace('solo run start press', { source: 'solo split pill' });
    onStart();
    trace.markFeedback('start dispatch');
  }, [onStart]);

  const openSheet = useCallback(() => setSheetVisible(true), []);
  const closeSheet = useCallback(() => setSheetVisible(false), []);
  const handlePickPacemaker = useCallback(() => {
    setSheetVisible(false);
    onOpenPacemaker();
  }, [onOpenPacemaker]);
  const handlePickGhost = useCallback(() => {
    setSheetVisible(false);
    onOpenGhostRun();
  }, [onOpenGhostRun]);

  return (
    <View style={styles.panel}>
      <View style={styles.pill}>
        <Pressable
          style={({ pressed }) => [
            styles.startSegment,
            startDisabled ? styles.segmentDisabled : undefined,
            pressed && !startDisabled ? styles.startSegmentPressed : undefined,
          ]}
          onPress={handleStart}
          disabled={startDisabled}
          accessibilityRole="button"
          accessibilityLabel={startLabel}
        >
          <Text style={styles.startText}>{startLabel}</Text>
        </Pressable>

        <View style={styles.segmentDivider} />

        <Pressable
          style={({ pressed }) => [
            styles.modeSegment,
            pressed ? styles.modeSegmentPressed : undefined,
          ]}
          onPress={openSheet}
          accessibilityRole="button"
          accessibilityLabel="달리기 방식 선택 — 페이스메이커, 자신과 대결"
        >
          <Feather name="sliders" size={20} color={fixedColors.brandLighter} />
        </Pressable>
      </View>

      <Text style={styles.hint}>페이스메이커 · 자신과 대결은 오른쪽 버튼에서</Text>

      <Modal
        visible={sheetVisible}
        transparent
        animationType="fade"
        onRequestClose={closeSheet}
      >
        <Pressable style={styles.sheetBackdrop} onPress={closeSheet}>
          {/* 시트 몸통 탭이 backdrop onPress로 새지 않게 이벤트를 삼킨다 */}
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>어떻게 달릴까요?</Text>

            <Pressable style={styles.sheetRow} onPress={closeSheet} accessibilityRole="button">
              <View style={styles.sheetRowBody}>
                <Text style={styles.sheetRowTitle}>그냥 뛰기</Text>
                <Text style={styles.sheetRowDescription}>거리와 페이스만 기록해요</Text>
              </View>
              <Feather name="check" size={18} color={colors.brand} />
            </Pressable>

            <Pressable style={styles.sheetRow} onPress={handlePickPacemaker} accessibilityRole="button">
              <View style={styles.sheetRowBody}>
                <Text style={styles.sheetRowTitle}>페이스메이커와 달리기</Text>
                <Text style={styles.sheetRowDescription}>목표 페이스를 귀로 알려줘요</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.textTertiary} />
            </Pressable>

            <Pressable
              style={[styles.sheetRow, styles.sheetRowLast]}
              onPress={handlePickGhost}
              accessibilityRole="button"
            >
              <View style={styles.sheetRowBody}>
                <Text style={styles.sheetRowTitle}>자신과 대결</Text>
                <Text style={styles.sheetRowDescription}>지난 기록을 옆에 두고 달려요</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.textTertiary} />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  panel: {
    gap: spacing.xxl,
  },
  pill: {
    flexDirection: 'row',
    borderRadius: radii.xl,
    overflow: 'hidden',
  },
  startSegment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.s20,
    backgroundColor: fixedColors.brand,
  },
  startSegmentPressed: {
    backgroundColor: fixedColors.brandStrong,
  },
  segmentDisabled: {
    opacity: 0.6,
  },
  startText: {
    color: fixedColors.white,
    fontSize: fontSizes.large,
    fontWeight: fontWeights.extraBold,
  },
  segmentDivider: {
    width: 1,
    backgroundColor: fixedColors.brandLight,
  },
  // 오른쪽 방식 칸 — 같은 필 안이지만 한 톤 어둡게 눌러 '다른 동작'임을 알린다.
  modeSegment: {
    width: 76,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: fixedColors.brandDeep,
  },
  modeSegmentPressed: {
    backgroundColor: fixedColors.brandStrong,
  },
  hint: {
    color: colors.textTertiary,
    fontSize: fontSizes.sm,
    textAlign: 'center',
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(10, 14, 30, 0.55)',
  },
  sheet: {
    paddingHorizontal: spacing.s16,
    paddingTop: spacing.s10,
    paddingBottom: spacing.s24,
    borderTopLeftRadius: radii.cardLarge,
    borderTopRightRadius: radii.cardLarge,
    backgroundColor: colors.surfaceChrome,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderMuted,
    marginBottom: spacing.s12,
  },
  sheetTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    marginBottom: spacing.xxl,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s10,
    paddingVertical: spacing.s14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  sheetRowLast: {
    borderBottomWidth: 0,
  },
  sheetRowBody: {
    flex: 1,
    gap: spacing.xxs,
  },
  sheetRowTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.button,
    fontWeight: fontWeights.extraBold,
  },
  sheetRowDescription: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
});
