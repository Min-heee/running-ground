import { useCallback, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import type { CrewHomeResponse, MyCrew } from '@/lib/api/types/crew';
import { leaveCrew } from '@/services';
import { colors, fontSizes, fontWeights } from '@/theme/tokens';
import { CrewHero } from '../components/CrewHero';
import { CrewActionRow, CrewMemberListRow, CrewSectionHeader } from '../components/CrewRows';
import { crewListStyles } from '../components/crewListStyles';
import { confirmCrewAction, showCrewNotice } from '../crewAlerts';
import {
  buildCrewHeroMeta,
  buildCrewHeroSeasonNote,
  buildCrewInviteShareMessage,
  buildCrewLeaveConfirmMessage,
  formatCrewNameWithStars,
  formatCrewRank,
  getCrewErrorMessage,
  isCrewStateDriftError,
  sortCrewMembersForDisplay,
} from '../crewModel';
import { useCrewHome } from '../hooks/useCrewHome';

// 내 크루 (오너 2026-09-18: "크루 탭이 너무 어수선하다" — 탭엔 크루 랭킹 카드와 내 크루 카드만 두고,
// 카드를 누르면 여기서 순위·멤버 기여·초대 코드 공유·크루 관리·크루 나가기를 한다). 순위 밖이어도
// 큰 글자 아래 설명 줄은 없다(같은 날 오너가 '시즌 멤버가 3명이 되면…' 줄을 뺐다).

function returnToCrewTab() {
  router.dismissTo('/(tabs)/crew');
}

function openManage() {
  router.push('/crew-manage');
}

export default function CrewMyCrewScreen() {
  const { home, error, nowMs, loadHome, applyHome } = useCrewHome();
  const [busy, setBusy] = useState(false);
  // 방금 크루를 나왔다 — 탭으로 닫히는 동안 '지금 들어가 있는 크루가 없어요'가 번쩍이지 않게 비워 둔다.
  const [left, setLeft] = useState(false);
  // Alert 이중 탭·연타 가드는 state가 아니라 ref로 — state는 같은 렌더 배치에서 낡은 값이라
  // 두 번째 호출을 못 막는다 (그라운드 화면 적대 리뷰와 같은 교훈).
  const actionInFlightRef = useRef(false);

  useFocusEffect(useCallback(() => {
    void loadHome();
  }, [loadHome]));

  const handleShareInvite = useCallback(async (myCrew: MyCrew) => {
    const message = buildCrewInviteShareMessage(myCrew.crew.name, myCrew.inviteCode);

    try {
      await Share.share({ message });
    } catch {
      // 공유 시트가 없는 환경(웹 등) — 링크째 복사로 대신한다.
      try {
        await Clipboard.setStringAsync(message);
        showCrewNotice('크루', '초대 링크를 복사했어요.');
      } catch {
        // 공유도 복사도 안 되면 조용히 둔다 — 코드는 행 글자에 이미 보인다.
      }
    }
  }, []);

  const handleLeave = useCallback((currentHome: CrewHomeResponse, myCrew: MyCrew) => {
    confirmCrewAction({
      title: '크루 나가기',
      message: buildCrewLeaveConfirmMessage({
        joinsLeftThisMonth: currentHome.joinsLeftThisMonth,
        isCaptain: myCrew.role === 'captain',
        memberCount: myCrew.crew.memberCount,
      }),
      confirmLabel: '나가기',
      destructive: true,
      onConfirm: () => {
        if (actionInFlightRef.current) {
          return;
        }
        actionInFlightRef.current = true;
        setBusy(true);

        void (async () => {
          try {
            const response = await leaveCrew(myCrew.crew.id);
            setLeft(true);
            // 응답은 뒤에 깔린 크루 탭에도 바로 간다(useCrewHome 방송) — 탭은 이미 크루 없음 화면이다.
            applyHome(response);
            // 나왔으면 이 화면은 비었다 — 크루 탭(크루 없음 화면)으로 돌아간다.
            returnToCrewTab();
          } catch (leaveError) {
            showCrewNotice('크루', getCrewErrorMessage(leaveError, '크루를 나가지 못했어요.'));
            // 그새 내보내졌거나 크루가 닫혔다 — 낡은 화면을 두지 않고 다시 부른다.
            if (isCrewStateDriftError(leaveError)) {
              void loadHome();
            }
          } finally {
            actionInFlightRef.current = false;
            setBusy(false);
          }
        })();
      },
    });
  }, [applyHome, loadHome]);

  return (
    <Screen>
      <AuthHeader showBack backHref="/(tabs)/crew" title="내 크루" />

      {!home && !error ? <ActivityIndicator size="large" color={colors.brand} /> : null}

      {error && !home ? (
        <Card>
          <Text style={crewListStyles.errorText}>{error}</Text>
          <PrimaryButton label="다시 불러오기" onPress={() => { void loadHome(); }} />
        </Card>
      ) : null}

      {home && !home.myCrew && !left ? (
        <Card>
          <Text style={styles.empty}>지금 들어가 있는 크루가 없어요.</Text>
          <PrimaryButton label="크루 탭으로" onPress={returnToCrewTab} />
        </Card>
      ) : null}

      {home?.myCrew ? (
        <MyCrewBody
          home={home}
          myCrew={home.myCrew}
          nowMs={nowMs}
          busy={busy}
          onShare={handleShareInvite}
          onLeave={handleLeave}
        />
      ) : null}
    </Screen>
  );
}

function MyCrewBody({
  home,
  myCrew,
  nowMs,
  busy,
  onShare,
  onLeave,
}: {
  home: CrewHomeResponse;
  myCrew: MyCrew;
  nowMs: number;
  busy: boolean;
  onShare: (myCrew: MyCrew) => void;
  onLeave: (home: CrewHomeResponse, myCrew: MyCrew) => void;
}) {
  const { crew, standing, members, role, inviteCode, pendingRequestCount } = myCrew;
  const sortedMembers = useMemo(() => sortCrewMembersForDisplay(members), [members]);

  return (
    <>
      <CrewHero
        label={`${formatCrewNameWithStars(crew.name, crew.stars)} · ${crew.memberCount}명`}
        value={formatCrewRank(standing.rank)}
        meta={standing.rank === null ? null : buildCrewHeroMeta(standing, home.top)}
        note={buildCrewHeroSeasonNote(home.season)}
      />

      {/* 크루 기여는 가져온 기록까지 세지만(오너 2026-09-18), 겹친 기록은 하나만·손으로 적은 기록은
          빼고·가입 뒤 기록만이라 기록 탭의 이번 달 거리와 다를 수 있다 — 그래서 '이번 달 거리'라고
          부르지 않고 '기여'라고 부른다. */}
      <View style={crewListStyles.section}>
        <CrewSectionHeader title="우리 크루 기여" />
        <Card style={crewListStyles.rowsCard}>
          {sortedMembers.map((member, index) => (
            <CrewMemberListRow key={member.userId} member={member} isFirst={index === 0} nowMs={nowMs} />
          ))}
        </Card>
      </View>

      <Card style={crewListStyles.actionsCard}>
        <CrewActionRow isFirst label={`초대 코드 공유 · ${inviteCode}`} onPress={() => onShare(myCrew)} />
        {role === 'captain' ? (
          <CrewActionRow
            isFirst={false}
            label="크루 관리"
            value={pendingRequestCount > 0 ? `신청 ${pendingRequestCount}` : null}
            valueTone="brand"
            onPress={openManage}
          />
        ) : null}
        <CrewActionRow isFirst={false} label="크루 나가기" danger disabled={busy} onPress={() => onLeave(home, myCrew)} />
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  empty: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    lineHeight: 20,
  },
});
