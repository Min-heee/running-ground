import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandLoadingView } from '@/components/BrandLoadingView';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import type { CrewHomeResponse, CrewJoinRequestRow, CrewMemberRow } from '@/lib/api/types/crew';
import {
  decideCrewJoinRequest,
  fetchCrewJoinRequests,
  kickCrewMember,
  rotateCrewInviteCode,
  transferCrewCaptain,
} from '@/services';
import { spacing } from '@/theme/tokens';
import { CrewActionRow, CrewMemberListRow, CrewSectionHeader, type CrewMemberRowAction } from '../components/CrewRows';
import { crewListStyles } from '../components/crewListStyles';
import { confirmCrewAction, showCrewNotice } from '../crewAlerts';
import {
  CREW_MAX_MEMBERS,
  buildCrewKickConfirmMessage,
  buildCrewRotateCodeConfirmMessage,
  buildCrewTransferCaptainConfirmMessage,
  formatCrewRequestDate,
  getCrewErrorMessage,
  isCrewStateDriftError,
  sortCrewMembersForDisplay,
} from '../crewModel';
import { useCrewHome } from '../hooks/useCrewHome';

// 크루 관리 (캡틴 전용, 오너 2026-09-18). 가입 신청 승인·거절, 멤버 내보내기(30일 재가입 불가),
// 캡틴 넘기기, 초대 코드 새로 만들기. 모든 동작은 행 안의 글자 액션이다(마이 탭 계정 카드 문법,
// 버튼 없음). 캡틴 넘기기는 시트 없이 이 화면의 멤버 목록을 '고르기' 상태로 바꿔서 고른다.
// 해체 버튼은 없다 — 마지막 멤버가 나가면 크루가 닫힌다 (조용한 복구 경로가 크루를 지우는 사고 방지).

type ManageMode = 'manage' | 'pickCaptain';

function goToCrewTab() {
  router.dismissTo('/(tabs)/crew');
}

export default function CrewManageScreen() {
  const { home, error, nowMs, loadHome, applyHome } = useCrewHome();
  const [requests, setRequests] = useState<CrewJoinRequestRow[] | null>(null);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [mode, setMode] = useState<ManageMode>('manage');
  const [busy, setBusy] = useState(false);
  // 연타·Alert 이중 탭 가드는 ref로 (state는 같은 렌더 배치에서 낡은 값이라 두 번째 호출을 못 막는다).
  const actionInFlightRef = useRef(false);
  const requestsSeqRef = useRef(0);
  const myCrew = home?.myCrew ?? null;
  const crewId = myCrew?.crew.id ?? null;
  const isCaptain = myCrew?.role === 'captain';

  useFocusEffect(useCallback(() => {
    void loadHome();
  }, [loadHome]));

  const loadRequests = useCallback(async (targetCrewId: string) => {
    const seq = requestsSeqRef.current + 1;
    requestsSeqRef.current = seq;

    try {
      const response = await fetchCrewJoinRequests(targetCrewId);
      if (seq === requestsSeqRef.current) {
        setRequests(response.requests);
        setRequestsError(null);
      }
    } catch (loadError) {
      if (seq === requestsSeqRef.current) {
        setRequestsError(getCrewErrorMessage(loadError, '가입 신청을 불러오지 못했어요.'));
      }
    }
  }, []);

  useEffect(() => {
    if (crewId && isCaptain) {
      void loadRequests(crewId);
    }
  }, [crewId, isCaptain, loadRequests]);

  const runAction = useCallback(async (action: () => Promise<void>) => {
    if (actionInFlightRef.current) {
      return;
    }
    actionInFlightRef.current = true;
    setBusy(true);

    try {
      await action();
    } finally {
      actionInFlightRef.current = false;
      setBusy(false);
    }
  }, []);

  const runHomeAction = useCallback((
    action: () => Promise<CrewHomeResponse>,
    failTitle: string,
    failMessage: string,
    onDone?: (response: CrewHomeResponse) => void,
  ) => runAction(async () => {
    try {
      const response = await action();
      applyHome(response);
      onDone?.(response);
    } catch (actionError) {
      showCrewNotice(failTitle, getCrewErrorMessage(actionError, failMessage));
      // 캡틴이 그새 자동으로 넘어갔거나(not_captain) 크루가 닫혔다 — 낡은 관리 화면을 두지 않고
      // 다시 불러 '캡틴만 할 수 있어요' 화면으로 바꾼다.
      if (isCrewStateDriftError(actionError)) {
        void loadHome();
      }
    }
  }), [applyHome, loadHome, runAction]);

  const decideRequest = useCallback((request: CrewJoinRequestRow, approve: boolean) => runAction(async () => {
    try {
      const response = await decideCrewJoinRequest(request.requestId, approve);
      requestsSeqRef.current += 1;
      setRequests(response.requests);
      if (approve) {
        // 승인은 멤버 목록을 바꾼다 — 응답이 신청 목록뿐이라 크루 홈을 다시 부른다.
        await loadHome();
      }
    } catch (decideError) {
      // 승인은 코드 가입과 같은 검사를 탄다 — 문구의 주어는 신청한 사람 ('decide' 맥락).
      showCrewNotice('가입 신청', getCrewErrorMessage(decideError, approve ? '가입 신청을 승인하지 못했어요.' : '가입 신청을 거절하지 못했어요.', 'decide'));
      // 신청자가 그새 다른 크루에 들어가 무효가 된 신청 등은 목록에서 사라져야 한다.
      if (crewId) {
        await loadRequests(crewId);
      }
    }
  }), [crewId, loadHome, loadRequests, runAction]);

  const handleApprove = useCallback((request: CrewJoinRequestRow) => {
    void decideRequest(request, true);
  }, [decideRequest]);

  const handleReject = useCallback((request: CrewJoinRequestRow) => {
    confirmCrewAction({
      title: '가입 신청 거절',
      message: `${request.name}님의 가입 신청을 거절할까요?`,
      confirmLabel: '거절',
      destructive: true,
      onConfirm: () => {
        void decideRequest(request, false);
      },
    });
  }, [decideRequest]);

  const handleKick = useCallback((member: CrewMemberRow) => {
    if (!crewId || !home) {
      return;
    }
    confirmCrewAction({
      title: '내보내기',
      message: buildCrewKickConfirmMessage(member.name, home.season.isPreseason),
      confirmLabel: '내보내기',
      destructive: true,
      onConfirm: () => {
        void runHomeAction(() => kickCrewMember(crewId, member.userId), '내보내기', '멤버를 내보내지 못했어요.');
      },
    });
  }, [crewId, home, runHomeAction]);

  const handlePickCaptain = useCallback((member: CrewMemberRow) => {
    if (!crewId) {
      return;
    }
    confirmCrewAction({
      title: '캡틴 넘기기',
      message: buildCrewTransferCaptainConfirmMessage(member.name),
      confirmLabel: '넘기기',
      onConfirm: () => {
        void runHomeAction(() => transferCrewCaptain(crewId, member.userId), '캡틴 넘기기', '캡틴을 넘기지 못했어요.', () => {
          setMode('manage');
          showCrewNotice('캡틴 넘기기', `${member.name}님이 캡틴이 됐어요.`);
          // 이제 캡틴이 아니다 — 관리 화면에 남아 있을 이유가 없다.
          goToCrewTab();
        });
      },
    });
  }, [crewId, runHomeAction]);

  const handleRotateCode = useCallback(() => {
    if (!crewId || !myCrew) {
      return;
    }
    confirmCrewAction({
      title: '초대 코드 새로 만들기',
      message: buildCrewRotateCodeConfirmMessage(myCrew.inviteCode),
      confirmLabel: '새로 만들기',
      destructive: true,
      onConfirm: () => {
        void runHomeAction(() => rotateCrewInviteCode(crewId), '초대 코드', '초대 코드를 새로 만들지 못했어요.', (response) => {
          if (response.myCrew) {
            showCrewNotice('초대 코드', `새 코드는 ${response.myCrew.inviteCode}예요.`);
          }
        });
      },
    });
  }, [crewId, myCrew, runHomeAction]);

  const toggleCaptainPicker = useCallback(() => {
    setMode((current) => (current === 'manage' ? 'pickCaptain' : 'manage'));
  }, []);

  const sortedMembers = useMemo(() => sortCrewMembersForDisplay(myCrew?.members ?? []), [myCrew?.members]);

  if (!home && !error) {
    return <BrandLoadingView />;
  }

  if (!home || !myCrew || !isCaptain) {
    return (
      <Screen>
        <AuthHeader showBack backHref="/(tabs)/crew" title="크루 관리" />
        <Card>
          <Text style={crewListStyles.emptyText}>{error ?? '크루 관리는 캡틴만 할 수 있어요.'}</Text>
          {error ? (
            <PrimaryButton label="다시 불러오기" onPress={() => { void loadHome(); }} />
          ) : (
            <PrimaryButton label="크루 탭으로" onPress={goToCrewTab} />
          )}
        </Card>
      </Screen>
    );
  }

  const pickingCaptain = mode === 'pickCaptain';

  return (
    <Screen>
      <AuthHeader showBack backHref="/(tabs)/crew" title="크루 관리" />

      <View style={crewListStyles.section}>
        <CrewSectionHeader title="가입 신청" meta={requests && requests.length > 0 ? `${requests.length}건` : null} />
        <Card style={crewListStyles.rowsCard}>
          {requestsError ? (
            <View style={crewListStyles.emptyBlock}>
              <Text style={crewListStyles.errorText}>{requestsError}</Text>
            </View>
          ) : requests && requests.length > 0 ? requests.map((request, index) => (
            <CrewRequestRow
              key={request.requestId}
              request={request}
              isFirst={index === 0}
              disabled={busy}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          )) : (
            <View style={crewListStyles.emptyBlock}>
              <Text style={crewListStyles.emptyText}>
                {requests ? '새 가입 신청이 없어요. 신청은 7일이 지나면 사라져요.' : '가입 신청을 불러오는 중이에요.'}
              </Text>
            </View>
          )}
        </Card>
      </View>

      <View style={crewListStyles.section}>
        <CrewSectionHeader
          title="멤버"
          meta={pickingCaptain ? '새 캡틴을 골라요' : `${myCrew.crew.memberCount}/${CREW_MAX_MEMBERS}명`}
        />
        <Card style={crewListStyles.rowsCard}>
          {sortedMembers.map((member, index) => {
            let action: CrewMemberRowAction | null = null;
            if (!member.isMe) {
              action = pickingCaptain
                ? { label: '캡틴으로', tone: 'brand', onPress: () => handlePickCaptain(member) }
                : { label: '내보내기', tone: 'danger', onPress: () => handleKick(member) };
            }
            return (
              <CrewMemberListRow
                key={member.userId}
                member={member}
                isFirst={index === 0}
                nowMs={nowMs}
                showKm={false}
                action={action}
                disabled={busy}
              />
            );
          })}
        </Card>
      </View>

      <Card style={crewListStyles.actionsCard}>
        <CrewActionRow
          isFirst
          label={pickingCaptain ? '캡틴 넘기기 그만두기' : '캡틴 넘기기'}
          disabled={busy || myCrew.crew.memberCount <= 1}
          onPress={toggleCaptainPicker}
        />
        <CrewActionRow
          isFirst={false}
          label="초대 코드 새로 만들기"
          value={myCrew.inviteCode}
          disabled={busy}
          onPress={handleRotateCode}
        />
      </Card>
    </Screen>
  );
}

const CrewRequestRow = memo(function CrewRequestRow({
  request,
  isFirst,
  disabled,
  onApprove,
  onReject,
}: {
  request: CrewJoinRequestRow;
  isFirst: boolean;
  disabled: boolean;
  onApprove: (request: CrewJoinRequestRow) => void;
  onReject: (request: CrewJoinRequestRow) => void;
}) {
  return (
    <View style={[crewListStyles.row, isFirst ? null : crewListStyles.rowDivided]}>
      <View style={crewListStyles.rowBody}>
        <Text style={crewListStyles.name} numberOfLines={1}>{request.name}</Text>
        <Text style={crewListStyles.meta}>{formatCrewRequestDate(request.createdAt)}</Text>
      </View>
      {/* 두 글자 액션 사이를 20 띄우고 hitSlop 8 — 누르는 영역이 서로 겹치지 않는다. */}
      <View style={styles.requestActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${request.name} 가입 신청 거절`}
          disabled={disabled}
          onPress={() => onReject(request)}
          hitSlop={8}
        >
          <Text style={[crewListStyles.textAction, disabled ? crewListStyles.actionRowDisabled : null]}>거절</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${request.name} 가입 신청 승인`}
          disabled={disabled}
          onPress={() => onApprove(request)}
          hitSlop={8}
        >
          <Text
            style={[
              crewListStyles.textAction,
              crewListStyles.textActionBrand,
              disabled ? crewListStyles.actionRowDisabled : null,
            ]}
          >
            승인
          </Text>
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  requestActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s20,
  },
});
