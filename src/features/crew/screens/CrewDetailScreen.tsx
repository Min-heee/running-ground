import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { BrandLoadingView } from '@/components/BrandLoadingView';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import type { CrewDetailResponse } from '@/lib/api/types/crew';
import { fetchCrewDetail, requestToJoinCrew } from '@/services';
import { colors, fontSizes, fontWeights } from '@/theme/tokens';
import { CrewHero } from '../components/CrewHero';
import { CrewMemberListRow, CrewSectionHeader } from '../components/CrewRows';
import { crewListStyles } from '../components/crewListStyles';
import { confirmCrewAction, showCrewNotice } from '../crewAlerts';
import {
  buildCrewRequestConfirmMessage,
  describeCrewUnranked,
  formatCrewNameWithStars,
  formatCrewRank,
  formatCrewScoreLine,
  getCrewErrorMessage,
  sortCrewMembersForDisplay,
} from '../crewModel';

// 다른 크루 한 곳 (/crew-detail?crewId=) — 순위표·검색 행을 누르면 온다. 히어로(이름 ★n · 인원,
// 큰 순위, 보정 인당) + 멤버 기여 + 공개 가입 신청(오너 2026-09-18: 초대 코드 + 공개 크루 신청 둘 다).
// 신청은 캡틴이 승인해야 들어가고, 승인은 코드 가입과 같은 검사(정원·차단·월 3회)를 탄다.

export default function CrewDetailScreen() {
  const params = useLocalSearchParams<{ crewId?: string | string[] }>();
  const crewId = Array.isArray(params.crewId) ? params.crewId[0] : params.crewId;
  const [detail, setDetail] = useState<CrewDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [requesting, setRequesting] = useState(false);
  const hasLoadedRef = useRef(false);
  const dataSeqRef = useRef(0);
  const actionInFlightRef = useRef(false);

  const loadDetail = useCallback(async () => {
    if (!crewId) {
      setError('크루를 찾지 못했어요.');
      return;
    }

    const seq = dataSeqRef.current;

    try {
      const response = await fetchCrewDetail(crewId);
      if (seq !== dataSeqRef.current) {
        return;
      }
      hasLoadedRef.current = true;
      setDetail(response);
      setNowMs(Date.now());
      setError(null);
    } catch (loadError) {
      if (!hasLoadedRef.current) {
        setError(getCrewErrorMessage(loadError, '크루 정보를 불러오지 못했어요.'));
      }
    }
  }, [crewId]);

  useFocusEffect(useCallback(() => {
    void loadDetail();
  }, [loadDetail]));

  const sortedMembers = useMemo(() => sortCrewMembersForDisplay(detail?.members ?? []), [detail?.members]);

  const handleRequest = useCallback(() => {
    if (!detail) {
      return;
    }

    confirmCrewAction({
      title: '가입 신청',
      message: buildCrewRequestConfirmMessage(detail.crew.name),
      confirmLabel: '신청하기',
      onConfirm: () => {
        if (actionInFlightRef.current) {
          return;
        }
        actionInFlightRef.current = true;
        setRequesting(true);
        void (async () => {
          try {
            await requestToJoinCrew(detail.crew.id);
            // 신청 응답은 크루 홈 페이로드라 이 화면 상태(신청 대기 중)는 다시 불러서 맞춘다.
            dataSeqRef.current += 1;
            await loadDetail();
          } catch (requestError) {
            showCrewNotice('가입 신청', getCrewErrorMessage(requestError, '가입 신청을 보내지 못했어요.'));
          } finally {
            actionInFlightRef.current = false;
            setRequesting(false);
          }
        })();
      },
    });
  }, [detail, loadDetail]);

  if (!detail && !error) {
    return <BrandLoadingView />;
  }

  return (
    <Screen>
      <AuthHeader showBack backHref="/(tabs)/crew" />

      {error && !detail ? (
        <Card>
          <Text style={crewListStyles.errorText}>{error}</Text>
          {crewId ? <PrimaryButton label="다시 불러오기" onPress={() => { void loadDetail(); }} /> : null}
        </Card>
      ) : null}

      {detail ? (
        <>
          <CrewHero
            label={`${formatCrewNameWithStars(detail.crew.name, detail.crew.stars)} · ${detail.crew.memberCount}명`}
            value={formatCrewRank(detail.standing.rank)}
            meta={detail.standing.rank === null
              ? describeCrewUnranked(detail.standing.unrankedReason, detail.members, detail.standing.seasonMemberCount)
              : formatCrewScoreLine(detail.standing.score)}
          />

          <View style={crewListStyles.section}>
            <CrewSectionHeader title="멤버 기여" />
            <Card style={crewListStyles.rowsCard}>
              {sortedMembers.map((member, index) => (
                <CrewMemberListRow key={member.userId} member={member} isFirst={index === 0} nowMs={nowMs} />
              ))}
            </Card>
          </View>

          {detail.canRequest ? (
            <PrimaryButton
              label={requesting ? '신청 보내는 중...' : '가입 신청'}
              disabled={requesting}
              onPress={handleRequest}
            />
          ) : null}
          {detail.myRequestPending ? (
            <Text style={styles.pendingText}>신청 대기 중 · 캡틴이 승인하면 들어가요</Text>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pendingText: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
});
