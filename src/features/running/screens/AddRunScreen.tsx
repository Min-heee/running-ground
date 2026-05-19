import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { useAddRunForm } from '@/features/running/hooks/useAddRunForm';
import { colors } from '@/theme/tokens';

export default function AddRunScreen() {
  const {
    date,
    distanceKm,
    error,
    handleSubmit,
    pace,
    resetDateToToday,
    setDate,
    setDistanceKm,
    setPace,
    submitting,
  } = useAddRunForm();

  return (
    <Screen>
      <AuthHeader
        title="수동 기록 추가"
        subtitle="기록 연동 전에도 직접 러닝 기록을 넣고 바로 포인트와 순위를 확인할 수 있어."
        showBack
        backHref="/my-activity"
      />

      <Card style={styles.formCard}>
        <Text style={styles.sectionTitle}>러닝 정보</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>날짜</Text>
          <TextInput
            value={date}
            onChangeText={setDate}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="2026-04-15"
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
            editable={!submitting}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>거리 (km)</Text>
          <TextInput
            value={distanceKm}
            onChangeText={setDistanceKm}
            keyboardType="decimal-pad"
            placeholder="예: 5.2"
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
            editable={!submitting}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>페이스</Text>
          <TextInput
            value={pace}
            onChangeText={setPace}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="예: 05:45/km"
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
            editable={!submitting}
          />
        </View>

        <View style={styles.tipBox}>
          <Text style={styles.tipTitle}>입력 기준</Text>
          <Text style={styles.tipText}>거리 10km마다 레벨업 +10P</Text>
          <Text style={styles.tipText}>연속 러닝은 레벨 20 미만 3km, 20 이상 5km부터 인정</Text>
          <Text style={styles.tipText}>이번 주가 저번 주보다 많아지면 성장 포인트 +10P</Text>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {submitting ? <ActivityIndicator size="small" color={colors.brand} /> : null}
        <PrimaryButton label={submitting ? '기록 저장 중...' : '기록 저장하기'} onPress={handleSubmit} />
      </Card>

      <Pressable style={styles.todayButton} onPress={resetDateToToday}>
        <Text style={styles.todayButtonText}>오늘 날짜로 다시 맞추기</Text>
      </Pressable>

      <SecondaryButton label="내 활동으로 돌아가기" onPress={() => router.replace('/my-activity')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  formCard: {
    gap: 14,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    color: colors.textStrongMuted,
    fontWeight: '700',
  },
  input: {
    backgroundColor: colors.surfaceSubtleAlt,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: colors.textPrimary,
  },
  tipBox: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 18,
    padding: 14,
    gap: 6,
  },
  tipTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  tipText: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  errorText: {
    color: colors.danger,
    fontWeight: '700',
    lineHeight: 20,
  },
  todayButton: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  todayButtonText: {
    color: colors.textMuted,
    fontWeight: '700',
  },
});
