import { useCallback, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Text, TextInput, View } from 'react-native';

import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { createCrew } from '@/services';
import { colors } from '@/theme/tokens';
import { crewListStyles as styles } from '../components/crewListStyles';
import { confirmCrewAction, showCrewNotice } from '../crewAlerts';
import {
  CREW_MAX_MEMBERS,
  CREW_NAME_MAX_LENGTH,
  CREW_NAME_MIN_LENGTH,
  buildCrewCreateConfirmMessage,
  checkCrewName,
  describeCrewCountsStart,
  getCrewErrorCode,
  getCrewErrorMessage,
} from '../crewModel';
import { useCrewHome } from '../hooks/useCrewHome';

// 크루 만들기 (오너 2026-09-18). 이름 하나만 받는다 — 만든 사람이 캡틴이 되고 6자리 초대 코드가 생긴다.
// 이름 규칙(2~12자·한글/영문/숫자·띄어쓰기 한 칸)은 입력하는 동안 바로 알려주고, 금칙어·중복은
// 서버만 알아서 거절 문구를 입력칸 아래에 그대로 띄운다. 30일에 한 번이라 확인을 한 번 받는다.

// isPreseason null = 크루 정보를 아직 못 받음 — 그땐 인정 시작 줄을 빼 둔다(모르는 채로 틀리게
// 말하지 않는다).
function buildCreateRuleLines(isPreseason: boolean | null): string[] {
  return [
    '한 번에 한 크루에만 들어갈 수 있어요',
    isPreseason === null ? null : describeCrewCountsStart(isPreseason),
    `최대 ${CREW_MAX_MEMBERS}명까지 함께해요`,
  ].filter((line): line is string => line !== null);
}

// 이름 때문에 거절된 코드는 Alert 대신 입력칸 아래에 — 고칠 자리 바로 옆에서 말한다.
const NAME_ERROR_CODES = new Set(['invalid_name', 'blocked_name', 'name_taken']);

// 만든 뒤엔 크루 탭으로 — 스택에 탭이 있으면 거기까지 걷어 내고, 없으면(딥링크 등) 탭으로 바꾼다.
// 크루 탭은 포커스 때 다시 불러오므로 돌아가기만 하면 새 크루가 보인다.
function returnToCrewTab() {
  router.dismissTo('/(tabs)/crew');
}

export default function CrewCreateScreen() {
  const { home, loadHome, applyHome } = useCrewHome();
  // null = 크루 정보를 아직 못 받음 — 인정 시작 문구를 단정하지 않는다.
  const isPreseason = home ? home.season.isPreseason : null;
  const [name, setName] = useState('');
  const [serverNameError, setServerNameError] = useState<{ name: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useFocusEffect(useCallback(() => {
    void loadHome();
  }, [loadHome]));

  const nameCheck = useMemo(() => checkCrewName(name), [name]);
  // 서버가 거절한 이름을 그대로 두는 동안만 그 문구를 보인다 — 한 글자라도 고치면 지운다.
  const serverError = serverNameError && serverNameError.name === name ? serverNameError.message : null;
  const inCrew = Boolean(home?.myCrew);
  const nameLength = Array.from(name.trim()).length;
  const helper = serverError
    ? { tone: 'error' as const, text: serverError }
    : !nameCheck.ok && nameCheck.reason !== 'empty'
      ? { tone: 'error' as const, text: nameCheck.message }
      : { tone: 'hint' as const, text: nameCheck.ok ? `${nameLength}/${CREW_NAME_MAX_LENGTH}` : `${CREW_NAME_MIN_LENGTH}~${CREW_NAME_MAX_LENGTH}자 · 한글·영문·숫자` };
  const canSubmit = nameCheck.ok && !serverError && !submitting && !inCrew;

  const handleSubmit = useCallback(() => {
    if (!nameCheck.ok || submittingRef.current) {
      return;
    }

    const crewName = nameCheck.name;
    confirmCrewAction({
      title: `'${crewName}' 만들기`,
      message: buildCrewCreateConfirmMessage(
        home?.joinsLeftThisMonth ?? null,
        Boolean(home?.myPendingRequest),
        isPreseason,
      ),
      confirmLabel: '만들기',
      onConfirm: () => {
        // Alert 버튼 연타 가드 — state는 같은 렌더 배치에서 낡은 값이라 ref로 막는다.
        if (submittingRef.current) {
          return;
        }
        submittingRef.current = true;
        setSubmitting(true);
        void (async () => {
          try {
            applyHome(await createCrew(crewName));
            returnToCrewTab();
          } catch (createError) {
            const code = getCrewErrorCode(createError);
            const message = getCrewErrorMessage(createError, '크루를 만들지 못했어요.');
            if (code && NAME_ERROR_CODES.has(code)) {
              setServerNameError({ name, message });
            } else {
              showCrewNotice('크루 만들기', message);
            }
          } finally {
            submittingRef.current = false;
            setSubmitting(false);
          }
        })();
      },
    });
  }, [applyHome, home?.joinsLeftThisMonth, home?.myPendingRequest, isPreseason, name, nameCheck]);

  return (
    <Screen>
      <AuthHeader showBack backHref="/(tabs)/crew" title="크루 만들기" subtitle="이름을 정하면 내가 캡틴이 되고 초대 코드가 생겨요." />

      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>크루 이름</Text>
        <TextInput
          style={styles.fieldInput}
          value={name}
          onChangeText={setName}
          onSubmitEditing={canSubmit ? handleSubmit : undefined}
          placeholder="예: 새벽러너스"
          placeholderTextColor={colors.textTertiary}
          maxLength={CREW_NAME_MAX_LENGTH + 2}
          returnKeyType="done"
          autoCorrect={false}
          accessibilityLabel="크루 이름"
        />
        <Text style={helper.tone === 'error' ? styles.errorText : styles.hintText}>{helper.text}</Text>
        {inCrew && home?.myCrew ? (
          <Text style={styles.errorText}>
            지금 {home.myCrew.crew.name}에 들어가 있어요. 나가야 새 크루를 만들 수 있어요.
          </Text>
        ) : null}
      </View>

      <Card style={styles.actionsCard}>
        {buildCreateRuleLines(isPreseason).map((line, index) => (
          <View key={line} style={[styles.actionRow, index === 0 ? null : styles.actionRowDivided]}>
            <Text style={styles.actionLabel}>{line}</Text>
          </View>
        ))}
      </Card>

      <PrimaryButton
        label={submitting ? '만드는 중...' : '크루 만들기'}
        disabled={!canSubmit}
        onPress={handleSubmit}
      />
    </Screen>
  );
}
