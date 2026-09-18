import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import type { CrewPreviewResponse } from '@/lib/api/types/crew';
import { joinCrewByCode, previewCrewByCode } from '@/services';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';
import { crewListStyles } from '../components/crewListStyles';
import { confirmCrewAction, showCrewNotice } from '../crewAlerts';
import {
  CREW_MAX_MEMBERS,
  buildCrewJoinConfirmMessage,
  describeCrewInviteCodeInput,
  formatCrewNameWithStars,
  formatCrewRank,
  formatCrewScoreLine,
  formatCrewUnrankedShort,
  getCrewErrorMessage,
  isValidCrewInviteCode,
  normalizeCrewInviteCode,
} from '../crewModel';
import { useCrewHome } from '../hooks/useCrewHome';

// 초대 코드로 가입 (/crew-join?code=). 딥링크 runningground://crew-join?code=X 로 들어오면 코드를
// 미리 채워 두기만 한다 — 절대 자동 가입하지 않는다(오너 2026-09-18). 크루 이동은 한 달에 3번뿐이라
// 사람이 미리보기를 보고 '가입하기'를 직접 눌러야 한다.
// 로그아웃 상태로 링크를 열면 로그인 게이트가 코드를 잃으므로, 손으로 넣는 칸이 기본 경로다.

type PreviewState =
  | { status: 'idle' }
  | { status: 'loading'; code: string }
  | { status: 'ready'; code: string; preview: CrewPreviewResponse }
  | { status: 'error'; code: string; message: string };

// 가입한 뒤엔 크루 탭으로 — 스택에 탭이 있으면 거기까지 걷어 내고(탭 위로 탭을 또 쌓지 않게),
// 앱 밖 링크로 이 화면만 떠 있으면 탭으로 바꾼다. 크루 탭은 포커스 때 새 크루를 불러온다.
function goToCrewTab() {
  router.dismissTo('/(tabs)/crew');
}

export default function CrewJoinScreen() {
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const initialCode = Array.isArray(params.code) ? params.code[0] : params.code;
  const [code, setCode] = useState(() => normalizeCrewInviteCode(initialCode ?? ''));
  const [previewState, setPreviewState] = useState<PreviewState>({ status: 'idle' });
  const [joining, setJoining] = useState(false);
  const joiningRef = useRef(false);
  const previewSeqRef = useRef(0);
  const { home, loadHome, applyHome } = useCrewHome();
  // null = 크루 정보를 아직 못 받음 — 인정 시작 문구를 단정하지 않는다.
  const isPreseason = home ? home.season.isPreseason : null;

  useFocusEffect(useCallback(() => {
    void loadHome();
  }, [loadHome]));

  // 앱이 떠 있는 채로 다른 코드 링크를 또 열면 파라미터만 바뀐다 — 칸도 따라 바꾼다.
  useEffect(() => {
    if (initialCode) {
      setCode(normalizeCrewInviteCode(initialCode));
    }
  }, [initialCode]);

  // 코드 미리보기는 서버가 10분에 10번으로 막는다 — 6자리가 다 찬 유효한 코드일 때만 부른다.
  useEffect(() => {
    const seq = previewSeqRef.current + 1;
    previewSeqRef.current = seq;

    if (!isValidCrewInviteCode(code)) {
      setPreviewState({ status: 'idle' });
      return;
    }

    setPreviewState({ status: 'loading', code });
    previewCrewByCode(code)
      .then((preview) => {
        if (seq === previewSeqRef.current) {
          setPreviewState({ status: 'ready', code, preview });
        }
      })
      .catch((previewError) => {
        if (seq === previewSeqRef.current) {
          setPreviewState({ status: 'error', code, message: getCrewErrorMessage(previewError, '크루를 불러오지 못했어요.') });
        }
      });
  }, [code]);

  const handleChangeCode = useCallback((text: string) => {
    setCode(normalizeCrewInviteCode(text));
  }, []);

  const codeHint = describeCrewInviteCodeInput(code);
  const myCrew = home?.myCrew ?? null;
  const joinsLeft = home?.joinsLeftThisMonth ?? null;
  const blockedReason = myCrew
    ? `지금 ${myCrew.crew.name}에 들어가 있어요. 나가야 다른 크루에 들어갈 수 있어요.`
    : joinsLeft === 0
      ? '이번 달 크루 이동 3번을 다 썼어요. 다음 달 1일부터 다시 들어갈 수 있어요.'
      : null;
  const preview = previewState.status === 'ready' ? previewState.preview : null;
  const canJoin = Boolean(preview) && !blockedReason && !joining;

  const handleJoin = useCallback(() => {
    if (!preview) {
      return;
    }

    confirmCrewAction({
      title: `${preview.crew.name} 가입`,
      message: buildCrewJoinConfirmMessage(
        home?.joinsLeftThisMonth ?? null,
        Boolean(home?.myPendingRequest),
        isPreseason,
      ),
      confirmLabel: '가입하기',
      onConfirm: () => {
        if (joiningRef.current) {
          return;
        }
        joiningRef.current = true;
        setJoining(true);
        void (async () => {
          try {
            applyHome(await joinCrewByCode(code));
            goToCrewTab();
          } catch (joinError) {
            showCrewNotice('크루 가입', getCrewErrorMessage(joinError, '크루에 들어가지 못했어요.'));
          } finally {
            joiningRef.current = false;
            setJoining(false);
          }
        })();
      },
    });
  }, [applyHome, code, home?.joinsLeftThisMonth, home?.myPendingRequest, isPreseason, preview]);

  return (
    <Screen>
      <AuthHeader showBack backHref="/(tabs)/crew" title="초대 코드로 가입" />

      <View style={crewListStyles.fieldBlock}>
        <Text style={crewListStyles.fieldLabel}>초대 코드</Text>
        <TextInput
          style={[crewListStyles.fieldInput, styles.codeInput]}
          value={code}
          onChangeText={handleChangeCode}
          placeholder="ABC23K"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="done"
          accessibilityLabel="초대 코드 6자리"
        />
        {codeHint ? (
          <Text style={codeHint.tone === 'error' ? crewListStyles.errorText : crewListStyles.hintText}>{codeHint.text}</Text>
        ) : null}
      </View>

      {previewState.status === 'loading' ? <ActivityIndicator color={colors.brand} /> : null}
      {previewState.status === 'error' ? <Text style={crewListStyles.errorText}>{previewState.message}</Text> : null}

      {preview ? (
        <Card style={styles.previewCard}>
          <Text style={styles.previewName}>{formatCrewNameWithStars(preview.crew.name, preview.crew.stars)}</Text>
          <Text style={styles.previewMeta}>
            {preview.crew.memberCount}/{CREW_MAX_MEMBERS}명 · 캡틴 {preview.crew.captainName}
          </Text>
          <Text style={styles.previewMeta}>
            {preview.standing.rank === null
              ? `순위 밖 · ${formatCrewUnrankedShort(preview.standing.unrankedReason)}`
              : `${formatCrewRank(preview.standing.rank)} · ${formatCrewScoreLine(preview.standing.score)}`}
          </Text>
        </Card>
      ) : null}

      {blockedReason ? <Text style={crewListStyles.hintText}>{blockedReason}</Text> : null}

      <PrimaryButton label={joining ? '가입하는 중...' : '가입하기'} disabled={!canJoin} onPress={handleJoin} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  codeInput: {
    fontSize: fontSizes.metric,
    letterSpacing: 4,
  },
  previewCard: {
    gap: spacing.sm,
  },
  previewName: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  previewMeta: {
    color: colors.textSecondary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
  },
});
