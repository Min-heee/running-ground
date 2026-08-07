import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AuthHeader } from '@/components/ui/AuthHeader';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Screen } from '@/components/Screen';
import { SegmentSwitch } from '@/components/ui/SegmentSwitch';
import { RunmadangDateWheelSheet } from '../components/RunmadangDateWheelSheet';
import {
  createRunmadang,
  fetchFriendLeaderboard,
  fetchMyProfile,
  fetchRunmadangMine,
  getApiErrorMessage,
} from '@/services';
import type { CreateRunmadangInput, RunmadangMetric } from '@/lib/api/types/runmadang';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';
import {
  RUNMADANG_METRIC_ITEMS,
  RUNMADANG_PERIOD_PRESET_ITEMS,
  RUNMADANG_STAKE_PRESETS,
  buildRunmadangStartBounds,
  clampRunmadangEndDate,
  dateKeyToMs,
  formatKstDayLabel,
  maxRunmadangEndKey,
} from '../runmadangModel';

// 그라운드 만들기 — 종목(거리/시간) · 기간(프리셋/직접) · 참가 포인트 · 친구 초대.
// 프리셋 기간은 '지금부터', 직접 지정은 내일부터 (서버 규칙과 동일).

type FriendOption = { id: string; name: string };

const MAX_INVITEES = 11;
const MAX_STAKE = 10000;
const MAX_TITLE_LENGTH = 20;

export default function RunmadangCreateScreen() {
  const [titleText, setTitleText] = useState('');
  const [metric, setMetric] = useState<RunmadangMetric>('distance');
  const [periodId, setPeriodId] = useState<string>('1w');
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [datePickerTarget, setDatePickerTarget] = useState<'start' | 'end' | null>(null);
  const [stakePoints, setStakePoints] = useState<number>(100);
  const [customStakeText, setCustomStakeText] = useState<string>('');
  const [useCustomStake, setUseCustomStake] = useState(false);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [friendOptions, setFriendOptions] = useState<FriendOption[]>([]);
  const [availablePoints, setAvailablePoints] = useState<number | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [saving, setSaving] = useState(false);
  // Alert 이중 큐잉 가드 — state(saving)는 확인 탭 후에야 바뀌어 빠른 이중 탭을 못 막는다.
  const submittingRef = useRef(false);

  const loadOptions = useCallback(async () => {
    setLoadState('loading');
    try {
      const [leaderboard, mine, profile] = await Promise.all([
        fetchFriendLeaderboard(),
        fetchRunmadangMine(),
        fetchMyProfile(),
      ]);
      // 친구 순위표에는 나 자신도 포함된다 — publicTag로 내 행을 걸러야 초대 칩에
      // 내 이름이 뜨지 않는다 (매치룸 로비 friendOptions와 같은 규칙).
      setFriendOptions(
        leaderboard.ranks
          .filter((rank) => typeof rank.id === 'string' && rank.id && rank.tag !== profile.publicTag)
          .map((rank) => ({ id: rank.id, name: rank.name })),
      );
      setAvailablePoints(mine.availablePoints);
      setLoadState('ready');
    } catch {
      setAvailablePoints(null);
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  const nowMs = useMemo(() => Date.now(), []);
  // 시작일 = 내일부터 31일, 종료일 = 시작일부터 최대 5년 (년/월/일 휠 피커의 경계).
  const startBounds = useMemo(() => buildRunmadangStartBounds(nowMs), [nowMs]);
  const startLabel = startDate ? formatKstDayLabel(dateKeyToMs(startDate)) : '선택';
  const endLabel = endDate ? formatKstDayLabel(dateKeyToMs(endDate)) : '선택';

  const effectiveStake = useCustomStake
    ? Math.min(MAX_STAKE, Math.max(0, Math.round(Number(customStakeText) || 0)))
    : stakePoints;
  const stakeExceedsBalance = typeof availablePoints === 'number' && effectiveStake > availablePoints;

  const handleToggleFriend = useCallback((friendId: string) => {
    setSelectedFriendIds((current) => {
      if (current.includes(friendId)) {
        return current.filter((id) => id !== friendId);
      }
      if (current.length >= MAX_INVITEES) {
        return current;
      }
      return [...current, friendId];
    });
  }, []);

  const handleSelectDate = useCallback((key: string) => {
    if (datePickerTarget === 'start') {
      setStartDate(key);
      // 기존 종료일을 새 시작일의 31일 창에 맞춘다 — 창 밖이면 null(다시 선택)로 리셋해
      // 화면엔 '선택'인데 낡은 값이 서버로 나가는 모순을 막는다.
      setEndDate((current) => (current ? clampRunmadangEndDate(key, current) : key));
    } else if (datePickerTarget === 'end') {
      setEndDate(key);
    }
    setDatePickerTarget(null);
  }, [datePickerTarget]);

  const canSubmit = titleText.trim().length > 0
    && selectedFriendIds.length > 0
    && !saving
    && !stakeExceedsBalance
    && (periodId !== 'custom'
      || Boolean(startDate && endDate && endDate >= startDate && endDate <= maxRunmadangEndKey(startDate)));

  const handleCreate = useCallback(() => {
    if (!canSubmit || submittingRef.current) {
      return;
    }

    const stakeLine = effectiveStake > 0
      ? `참가 포인트 ${effectiveStake}P를 걸고 시작할까요? 참가자 전원이 같은 포인트를 걸고, 1등이 상금을 전부 가져가요.`
      : '참가 포인트 없이 시작할까요? 승패 기록만 남아요.';

    Alert.alert('그라운드 시작', stakeLine, [
      { text: '취소', style: 'cancel' },
      {
        text: '시작',
        onPress: () => {
          // 이중 탭으로 Alert가 두 개 큐잉돼도 두 번째 확인은 여기서 무해화된다.
          if (submittingRef.current) {
            return;
          }
          submittingRef.current = true;
          void (async () => {
            setSaving(true);
            try {
              const input: CreateRunmadangInput = {
                title: titleText.trim(),
                metric,
                stakePoints: effectiveStake,
                invitedFriendIds: selectedFriendIds,
                ...(periodId === 'custom'
                  ? { startDate: startDate ?? undefined, endDate: endDate ?? undefined }
                  : { periodPreset: periodId as CreateRunmadangInput['periodPreset'] }),
              };
              await createRunmadang(input);
              // 목록 화면은 스택에 이미 있다 — replace로 2겹 쌓지 않고 복귀 (포커스 시 재조회).
              router.back();
            } catch (createError) {
              submittingRef.current = false;
              Alert.alert('그라운드', getApiErrorMessage(createError, '그라운드를 만들지 못했어요.'));
            } finally {
              setSaving(false);
            }
          })();
        },
      },
    ]);
  }, [canSubmit, effectiveStake, endDate, metric, periodId, selectedFriendIds, startDate, titleText]);

  return (
    <Screen>
      <AuthHeader
        title="그라운드 만들기"
        subtitle="기간 동안 더 많이 달린 사람이 상금을 가져가요."
        showBack
        backHref="/runmadang"
      />

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>이름</Text>
        <TextInput
          style={styles.titleInput}
          value={titleText}
          onChangeText={setTitleText}
          placeholder="예: 이번 주 10km 내기, 커피 내기"
          placeholderTextColor={colors.textTertiary}
          maxLength={MAX_TITLE_LENGTH}
          returnKeyType="done"
        />
        <Text style={styles.helperText}>친구 초대 알림과 판 목록에 이 이름이 보여요.</Text>
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>종목</Text>
        <SegmentSwitch
          items={[...RUNMADANG_METRIC_ITEMS]}
          activeId={metric}
          onSelect={(id) => setMetric(id as RunmadangMetric)}
          variant="card"
        />
        <Text style={styles.helperText}>
          {metric === 'distance' ? '기간 동안 달린 총 거리로 겨뤄요.' : '기간 동안 달린 총 시간으로 겨뤄요.'}
        </Text>
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>기간</Text>
        <View style={styles.chipRow}>
          {RUNMADANG_PERIOD_PRESET_ITEMS.map((item) => (
            <Pressable
              key={item.id}
              style={[styles.chip, periodId === item.id ? styles.chipActive : null]}
              onPress={() => setPeriodId(item.id)}
            >
              <Text style={[styles.chipText, periodId === item.id ? styles.chipTextActive : null]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {periodId === 'custom' ? (
          <View style={styles.dateRow}>
            <Pressable style={styles.dateField} onPress={() => setDatePickerTarget('start')}>
              <Text style={styles.dateFieldLabel}>시작일</Text>
              <Text style={styles.dateFieldValue}>{startLabel}</Text>
            </Pressable>
            <Pressable
              style={[styles.dateField, !startDate ? styles.dateFieldDisabled : null]}
              onPress={startDate ? () => setDatePickerTarget('end') : undefined}
            >
              <Text style={styles.dateFieldLabel}>종료일</Text>
              <Text style={styles.dateFieldValue}>{endLabel}</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.helperText}>지금부터 바로 시작돼요. 직접 지정은 내일부터 고를 수 있어요.</Text>
        )}
      </Card>

      <Card style={styles.sectionCard}>
        <View style={styles.stakeHeaderRow}>
          <Text style={styles.sectionTitle}>참가 포인트</Text>
          <Text style={styles.balanceText}>
            보유 {typeof availablePoints === 'number' ? Math.max(0, Math.round(availablePoints)).toLocaleString() : '--'}P
          </Text>
        </View>
        <View style={styles.chipRow}>
          {RUNMADANG_STAKE_PRESETS.map((preset) => {
            const active = !useCustomStake && stakePoints === preset;
            return (
              <Pressable
                key={preset}
                style={[styles.chip, active ? styles.chipActive : null]}
                onPress={() => {
                  setUseCustomStake(false);
                  setStakePoints(preset);
                }}
              >
                <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                  {preset === 0 ? '없음' : `${preset}P`}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            style={[styles.chip, useCustomStake ? styles.chipActive : null]}
            onPress={() => setUseCustomStake(true)}
          >
            <Text style={[styles.chipText, useCustomStake ? styles.chipTextActive : null]}>직접 입력</Text>
          </Pressable>
        </View>
        {useCustomStake ? (
          <TextInput
            style={styles.stakeInput}
            value={customStakeText}
            onChangeText={setCustomStakeText}
            keyboardType="number-pad"
            placeholder={`0~${MAX_STAKE}`}
            placeholderTextColor={colors.textTertiary}
            maxLength={5}
          />
        ) : null}
        {stakeExceedsBalance ? (
          <Text style={styles.warnText}>보유 포인트보다 참가 포인트가 커요.</Text>
        ) : (
          <Text style={styles.helperText}>참가자 전원이 같은 포인트를 걸어요. 1등이 상금을 전부 가져가요.</Text>
        )}
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>친구 초대 ({selectedFriendIds.length}/{MAX_INVITEES})</Text>
        {loadState === 'loading' ? (
          <Text style={styles.helperText}>친구 목록을 불러오는 중...</Text>
        ) : loadState === 'error' ? (
          <>
            <Text style={styles.helperText}>친구 목록을 불러오지 못했어요.</Text>
            <Pressable style={styles.chip} onPress={() => { void loadOptions(); }}>
              <Text style={styles.chipText}>다시 시도</Text>
            </Pressable>
          </>
        ) : friendOptions.length === 0 ? (
          <Text style={styles.helperText}>초대할 친구가 없어요. 친구탭에서 먼저 친구를 추가해주세요.</Text>
        ) : (
          <View style={styles.chipRow}>
            {friendOptions.map((friend) => {
              const selected = selectedFriendIds.includes(friend.id);
              return (
                <Pressable
                  key={friend.id}
                  style={[styles.chip, selected ? styles.chipActive : null]}
                  onPress={() => handleToggleFriend(friend.id)}
                >
                  <Text style={[styles.chipText, selected ? styles.chipTextActive : null]}>
                    {friend.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </Card>

      <PrimaryButton
        label={saving ? '만드는 중...' : '그라운드 시작'}
        onPress={handleCreate}
        disabled={!canSubmit}
      />

      <RunmadangDateWheelSheet
        visible={datePickerTarget !== null}
        title={datePickerTarget === 'start' ? '시작일 선택' : '종료일 선택'}
        minKey={datePickerTarget === 'end' && startDate ? startDate : startBounds.minKey}
        maxKey={datePickerTarget === 'end' && startDate
          ? maxRunmadangEndKey(startDate)
          : startBounds.maxKey}
        selectedKey={datePickerTarget === 'start' ? startDate : endDate}
        onSelect={handleSelectDate}
        onClose={() => setDatePickerTarget(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionCard: {
    gap: spacing.s10,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
  },
  helperText: {
    color: colors.textTertiary,
    fontSize: fontSizes.xs,
    lineHeight: 17,
  },
  warnText: {
    color: colors.danger,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  chip: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s10,
  },
  chipActive: {
    backgroundColor: colors.brandWash,
    borderColor: colors.brandSoftBorder,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  chipTextActive: {
    color: colors.brandDeep,
  },
  dateRow: {
    flexDirection: 'row',
    gap: spacing.s10,
  },
  dateField: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s12,
    gap: spacing.xs,
  },
  dateFieldDisabled: {
    opacity: 0.5,
  },
  dateFieldLabel: {
    color: colors.textTertiary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  dateFieldValue: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  stakeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  balanceText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  stakeInput: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s12,
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  titleInput: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s12,
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
});
