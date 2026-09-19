import { memo, useCallback } from 'react';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import type { CrewMemberRow, CrewStandingRow } from '@/lib/api/types/crew';
import {
  formatCrewKm,
  formatCrewMemberJoinTag,
  formatCrewNameWithStars,
  formatCrewScore,
  isCrewPodiumRank,
} from '../crewModel';
import { crewListStyles as styles } from './crewListStyles';

// 크루 화면의 행 부품. ⚠️ 어느 행도 `<Link asChild>`로 감싸지 않는다 — Slot이 Link의 style과
// 자식 style을 배열로 병합해 웹에선 렌더가 죽고, 함수형 style(눌림 상태)은 통째로 사라진다
// (기록 행·친구 순위 행에서 실측한 함정). 이동은 전부 router.push.

export function CrewSectionHeader({ title, meta }: { title: string; meta?: string | null }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {meta ? <Text style={styles.sectionMeta} numberOfLines={1}>{meta}</Text> : null}
    </View>
  );
}

function openCrewDetail(crewId: string) {
  router.push({ pathname: '/crew-detail', params: { crewId } });
}

// 순위 한 줄: 순위 숫자(1~3위 금색) · 이름 ★n · 오른쪽 값. 오른쪽 값은 기본이 인당 km,
// 순위 밖 목록에서는 한 단어 사유를 넘겨 받는다.
export const CrewStandingListRow = memo(function CrewStandingListRow({
  row,
  isFirst,
  meta,
  rightText,
}: {
  row: CrewStandingRow;
  isFirst: boolean;
  meta?: string | null;
  rightText?: string;
}) {
  const handlePress = useCallback(() => openCrewDetail(row.crewId), [row.crewId]);
  const displayName = formatCrewNameWithStars(row.name, row.stars);
  const valueText = rightText ?? `${formatCrewScore(row.score)}km`;

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={[row.rank ? `${row.rank}위` : '순위 밖', displayName, rightText ?? `인당 ${valueText}`].join(' ')}
      style={({ pressed }) => [
        styles.row,
        isFirst ? null : styles.rowDivided,
        row.isMine ? styles.rowMine : null,
        pressed ? styles.rowPressed : null,
      ]}
    >
      <Text style={[styles.rankNumber, isCrewPodiumRank(row.rank) ? styles.rankNumberPodium : null]}>
        {row.rank ?? ''}
      </Text>
      <View style={styles.rowBody}>
        <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
        {meta ? <Text style={styles.meta} numberOfLines={1}>{meta}</Text> : null}
      </View>
      <Text
        style={[
          styles.value,
          rightText ? styles.valueMuted : null,
          row.isMine && !rightText ? styles.valueMine : null,
        ]}
        numberOfLines={1}
      >
        {valueText}
      </Text>
    </Pressable>
  );
});

export function CrewFooterRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.footerRow} hitSlop={8}>
      <Text style={styles.footerText}>{label}</Text>
      <Text style={styles.footerChevron}>›</Text>
    </Pressable>
  );
}

export type CrewMemberRowAction = {
  label: string;
  tone: 'brand' | 'danger' | 'muted';
  onPress: () => void;
};

// 멤버 한 줄: 이름 + 회색 꼬리표(캡틴 · 나 · 10/9 합류) + 오른쪽 기여 km(또는 글자 액션).
// 아직 크루 점수에 안 들어간 신입의 km는 회색 — 쌓이고는 있지만 셈에는 아직이다.
export const CrewMemberListRow = memo(function CrewMemberListRow({
  member,
  isFirst,
  nowMs,
  showKm = true,
  action,
  disabled = false,
}: {
  member: CrewMemberRow;
  isFirst: boolean;
  nowMs: number;
  showKm?: boolean;
  action?: CrewMemberRowAction | null;
  disabled?: boolean;
}) {
  const joinTag = formatCrewMemberJoinTag(member, nowMs);
  const tags = [member.role === 'captain' ? '캡틴' : null, member.isMe ? '나' : null, joinTag]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={[styles.row, isFirst ? null : styles.rowDivided]}>
      <View style={styles.nameLine}>
        <Text style={styles.name} numberOfLines={1}>{member.name}</Text>
        {tags ? <Text style={styles.nameTag}>{tags}</Text> : null}
      </View>
      {showKm ? (
        <Text style={[styles.value, joinTag ? styles.valueMuted : null]}>
          {formatCrewKm(member.contributionKm)}km
        </Text>
      ) : null}
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${member.name} ${action.label}`}
          onPress={action.onPress}
          disabled={disabled}
          hitSlop={10}
        >
          <Text
            style={[
              styles.textAction,
              action.tone === 'brand' ? styles.textActionBrand : null,
              action.tone === 'danger' ? styles.textActionDanger : null,
              disabled ? styles.actionRowDisabled : null,
            ]}
          >
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
});

// 설정식 액션 행 (마이 탭 계정 카드 문법): 왼쪽 bold 라벨, 오른쪽 회색 값(선택).
export function CrewActionRow({
  label,
  value,
  valueTone = 'muted',
  danger = false,
  chevron = false,
  isFirst,
  disabled = false,
  onPress,
}: {
  label: string;
  value?: string | null;
  valueTone?: 'muted' | 'brand';
  danger?: boolean;
  // 다른 화면으로 넘어가는 행 — '›'는 그림일 뿐이라 읽어 주는 이름(accessibilityLabel)에 넣지 않는다.
  chevron?: boolean;
  isFirst: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label} ${value}` : label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={{ top: 2, bottom: 2 }}
      style={[
        styles.actionRow,
        isFirst ? null : styles.actionRowDivided,
        disabled ? styles.actionRowDisabled : null,
      ]}
    >
      <Text style={[styles.actionLabel, danger ? styles.actionLabelDanger : null]} numberOfLines={1}>
        {label}
      </Text>
      {value ? (
        <Text style={[styles.actionValue, valueTone === 'brand' ? styles.actionValueBrand : null]}>{value}</Text>
      ) : null}
      {chevron ? <Text style={styles.footerChevron}>›</Text> : null}
    </Pressable>
  );
}
