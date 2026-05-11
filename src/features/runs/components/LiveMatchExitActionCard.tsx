import { Pressable, StyleSheet, Text } from 'react-native';
import { Card } from '@/components/Card';
import { SecondaryButton } from '@/components/ui/SecondaryButton';

type MatchExitSource = 'duel' | 'group';

type LiveMatchExitActionCardProps = {
  source: MatchExitSource | null;
  isTestMatch: boolean;
  isLeaving: boolean;
  isSaving: boolean;
  isRunning: boolean;
  counterpartForfeited: boolean;
  onContinueSolo: (source: MatchExitSource) => void;
  onForfeit: (source: MatchExitSource) => void;
  onShowResultAfterCounterpartForfeit: (source: MatchExitSource) => void;
};

export function LiveMatchExitActionCard({
  source,
  isTestMatch,
  isLeaving,
  isSaving,
  isRunning,
  counterpartForfeited,
  onContinueSolo,
  onForfeit,
  onShowResultAfterCounterpartForfeit,
}: LiveMatchExitActionCardProps) {
  if (!source) {
    return null;
  }

  if (isTestMatch) {
    return (
      <Card style={styles.testExitCard}>
        <Text style={styles.title}>테스트 대결을 여기서 끝낼 수 있어요</Text>
        <Text style={styles.text}>
          테스트 상대 표시는 정리하고, 지금 러닝 기록은 혼자 계속 이어갈게요.
        </Text>
        <SecondaryButton
          label={isLeaving ? '정리 중...' : '테스트 대결 그만'}
          onPress={() => onContinueSolo(source)}
          disabled={isLeaving}
        />
      </Card>
    );
  }

  if (counterpartForfeited) {
    const isPreparingResult = isLeaving || isSaving || !isRunning;

    return (
      <Card style={styles.card}>
        <Text style={styles.title}>상대가 기권했어요</Text>
        <Text style={styles.text}>
          내가 승리한 상태예요. 러닝을 종료하면 결과 화면에서 대결 결과를 확인할 수 있어요.
        </Text>
        <Pressable
          style={[styles.button, isPreparingResult ? styles.buttonDisabled : undefined]}
          onPress={() => onShowResultAfterCounterpartForfeit(source)}
          disabled={isPreparingResult}
        >
          <Text style={styles.buttonText}>
            {isLeaving || isSaving ? '결과 저장 중...' : !isRunning ? '결과 화면 준비 중...' : '러닝 종료하고 결과보기'}
          </Text>
        </Pressable>
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>대결을 기권할 수 있어요</Text>
      <Text style={styles.text}>
        기권하면 내 동그라미가 기권 상태로 표시되고, 지금까지 측정한 기록을 저장한 뒤 나가요.
      </Text>
      <Pressable
        style={[styles.button, isLeaving ? styles.buttonDisabled : undefined]}
        onPress={() => onForfeit(source)}
        disabled={isLeaving}
      >
        <Text style={styles.buttonText}>
          {isLeaving ? '기권 처리 중...' : '기권하기'}
        </Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  testExitCard: {
    gap: 10,
    borderColor: '#818CF8',
    borderWidth: 1,
    backgroundColor: '#EEF2FF',
  },
  card: {
    gap: 10,
    borderColor: '#FECACA',
    borderWidth: 1,
    backgroundColor: '#FEF2F2',
  },
  title: {
    color: '#7F1D1D',
    fontSize: 16,
    fontWeight: '900',
  },
  text: {
    color: '#B42318',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
  },
  button: {
    marginTop: 4,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: '#D92D20',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
});
