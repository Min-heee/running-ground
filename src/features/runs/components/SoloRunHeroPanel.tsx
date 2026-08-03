// 혼자 러닝의 시작 영역 (오너 2026-08-03, 시안 D+다 확정).
//
// RUN 세로 히어로 블록(브랜드 솔리드, 센터 타이포)이 화면의 주인공이고, 아래 두 부가
// 기능은 RUN과 같은 센터 타이포 결의 미니 히어로 타일(PACE / VS ME 오버라인 + 한글
// 제목)로 반반. 장식 아이콘 없이 타이포만으로 무게를 준다.

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  formatGoalInputKm,
  getSoloRunGoalKm,
  parseGoalInputKm,
  setSoloRunGoalKm,
  useSoloRunGoalKm,
} from '@/features/runs/soloGoal/soloRunGoalStore';
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
  const handleStart = useCallback(() => {
    const trace = beginRgInputTrace('solo run start press', { source: 'solo hero block' });
    onStart();
    trace.markFeedback('start dispatch');
  }, [onStart]);

  return (
    <View style={styles.panel}>
      {/* 목표 칩은 RUN Pressable의 형제로 같은 보라 블록 안에 둔다 — 칩 안에 중첩하면
          몇 pt만 빗맞아도 그 터치가 RUN에 떨어져 러닝이 시작돼버리고, 접근성 트리에서도
          바깥 버튼이 칩을 삼킨다 (적대 리뷰 발견). 칩 줄과 그 여백은 어떤 탭도 시작을
          트리거하지 않는 완충 지대다. */}
      <View style={styles.startBlock}>
        <Pressable
          style={({ pressed }) => [
            styles.startPressable,
            startDisabled ? styles.startButtonDisabled : undefined,
            pressed && !startDisabled ? styles.startButtonPressed : undefined,
          ]}
          onPress={handleStart}
          disabled={startDisabled}
          accessibilityRole="button"
          accessibilityLabel={startLabel}
        >
          <Text style={styles.startOverline}>RUN</Text>
          <Text style={styles.startText}>{startLabel}</Text>
        </Pressable>
        <GoalInput />
      </View>

      <View style={styles.subRow}>
        <SubTile overline="PACE" label="페이스메이커와 달리기" onPress={onOpenPacemaker} />
        <SubTile overline="VS ME" label="자신과 대결" onPress={onOpenGhostRun} />
      </View>
    </View>
  );
});

// 목표 직접 입력 (오너 2026-08-03: 칩 → 입력창). 타이핑 중에도 유효하면 바로 스토어에
// 반영 — 키보드를 안 닫고 RUN을 눌러도 목표가 이미 저장돼 있게. 못 읽는 입력은 blur
// 때 마지막 유효값으로 되돌린다.
const GoalInput = memo(function GoalInput() {
  const storeGoalKm = useSoloRunGoalKm();
  const [goalText, setGoalText] = useState(() => formatGoalInputKm(getSoloRunGoalKm()));
  const isFocusedRef = useRef(false);

  // 페이스메이커/자신과 대결이 자기 목표로 스토어를 바꾸면 입력창도 따라간다 —
  // 단, 타이핑 중('7.' 입력 중 '7'로 되돌아가는 문제)에는 건드리지 않는다.
  useEffect(() => {
    if (!isFocusedRef.current) {
      setGoalText(formatGoalInputKm(storeGoalKm));
    }
  }, [storeGoalKm]);

  const handleChangeText = useCallback((nextText: string) => {
    setGoalText(nextText);
    const parsedKm = parseGoalInputKm(nextText);

    if (parsedKm !== null) {
      setSoloRunGoalKm(parsedKm);
    }
  }, []);

  const handleFocus = useCallback(() => {
    isFocusedRef.current = true;
  }, []);

  const handleCommit = useCallback(() => {
    isFocusedRef.current = false;
    setGoalText(formatGoalInputKm(getSoloRunGoalKm()));
    Keyboard.dismiss();
  }, []);

  return (
    <View style={styles.goalRow}>
      <Text style={styles.goalLabel}>목표</Text>
      <TextInput
        style={styles.goalInput}
        value={goalText}
        onChangeText={handleChangeText}
        onFocus={handleFocus}
        onBlur={handleCommit}
        onSubmitEditing={handleCommit}
        keyboardType="decimal-pad"
        returnKeyType="done"
        maxLength={4}
        selectTextOnFocus
        placeholder="5"
        placeholderTextColor="rgba(255, 255, 255, 0.5)"
        accessibilityLabel="목표 거리 입력 (킬로미터)"
      />
      <Text style={styles.goalUnit}>km</Text>
    </View>
  );
});

const SubTile = memo(function SubTile({
  overline,
  label,
  onPress,
}: {
  overline: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.subTile, pressed ? styles.subTilePressed : undefined]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.subTileOverline}>{overline}</Text>
      <Text style={styles.subTileLabel}>{label}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  panel: {
    gap: spacing.s10,
  },
  // 틴트가 brandWash 토큰이 아닌 고정 rgba인 이유: 라이트 brandWash(#EEF2FF)는 앱 배경
  // (#EFF0FA)과 거의 같은 색이라 버튼이 사라졌다. 반투명 브랜드는 밝은 배경에선 연보라,
  // 다크 네이비 위에선 보라 유리로 앉아 양쪽 모드에서 성립한다(2026-07-27 승인된 그 톤).
  // 세로 히어로 — 시안 D의 두툼한 블록. 블록(배경)과 Pressable(RUN 영역)을 분리해
  // 목표 칩 줄이 시작 히트영역 밖에 있게 한다.
  startBlock: {
    borderRadius: radii.cardLarge,
    backgroundColor: fixedColors.brand,
    overflow: 'hidden',
  },
  startPressable: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    paddingTop: spacing.s24,
    paddingBottom: spacing.s12,
    gap: spacing.xs,
  },
  startButtonPressed: {
    backgroundColor: fixedColors.brandStrong,
  },
  startButtonDisabled: {
    opacity: 0.6,
  },
  startOverline: {
    color: fixedColors.white,
    fontSize: fontSizes.summaryValue,
    fontWeight: fontWeights.black,
    letterSpacing: 2,
  },
  startText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: fontSizes.md,
    fontWeight: fontWeights.bold,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    // 칩 위아래 여백 = 완충 지대. 여기를 탭해도 아무 일도 일어나지 않는다.
    paddingTop: spacing.xs,
    paddingBottom: spacing.s16,
    paddingHorizontal: spacing.s16,
  },
  goalLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    marginRight: spacing.xxs,
  },
  goalInput: {
    minWidth: 76,
    textAlign: 'center',
    color: fixedColors.white,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.extraBold,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s10,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.45)',
  },
  goalUnit: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  subRow: {
    flexDirection: 'row',
    gap: spacing.s10,
  },
  subTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.s18,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.cardLarge,
    backgroundColor: 'rgba(109, 94, 247, 0.13)',
    borderWidth: 1.5,
    borderColor: 'rgba(142, 123, 255, 0.5)',
    gap: spacing.xxs,
  },
  subTilePressed: {
    backgroundColor: 'rgba(109, 94, 247, 0.26)',
  },
  subTileOverline: {
    color: colors.brandDeep,
    fontSize: fontSizes.rank,
    fontWeight: fontWeights.black,
    letterSpacing: 0.5,
  },
  subTileLabel: {
    color: colors.brandMuted,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
});
