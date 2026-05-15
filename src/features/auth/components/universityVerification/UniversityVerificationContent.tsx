import { router } from 'expo-router';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Card } from '@/components/Card';
import { ListRow } from '@/components/ui/ListRow';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { VERIFICATION_METHODS } from '@/features/auth/utils/universityVerification';
import { universityVerificationStyles as styles } from './universityVerificationStyles';
import type { UniversityVerificationModel } from './types';

export function UniversityVerificationContent({ model }: { model: UniversityVerificationModel }) {
  if (!model.profile) {
    return null;
  }

  return (
    <>
      <CurrentUniversityStatus
        universityName={model.profile.universityName}
      />
      <VerificationMethodPicker
        selectedMethodId={model.selectedMethodId}
        onSelectMethod={model.handleSelectMethod}
      />
      <VerificationDraftForm model={model} />
      {model.draftCreated ? <VerificationDraftPreview model={model} /> : null}
      <VerificationMethodGuide
        checklist={model.selectedMethod.checklist}
        steps={model.selectedMethod.steps}
      />
      <VerificationBenefitsCard />
      <SecondaryButton label="마이페이지로 돌아가기" onPress={() => router.replace('/(tabs)/mypage')} />
    </>
  );
}

function CurrentUniversityStatus({ universityName }: { universityName?: string }) {
  return (
    <Card style={styles.statusCard}>
      <Text style={styles.sectionTitle}>현재 상태</Text>
      <View style={styles.statusBadge}>
        <Text style={styles.statusLabel}>{universityName ? '인증 연결됨' : '인증 전'}</Text>
      </View>
      <Text style={styles.statusValue}>
        {universityName ? universityName : '아직 인증된 대학교가 없어요.'}
      </Text>
      <Text style={styles.statusHint}>
        출시 초기에는 임의 입력보다 인증 정확도를 우선해서, 인증된 학교만 대학 리그에 반영하는 방향으로 갈게요.
      </Text>
    </Card>
  );
}

function VerificationMethodPicker({
  onSelectMethod,
  selectedMethodId,
}: {
  onSelectMethod: UniversityVerificationModel['handleSelectMethod'];
  selectedMethodId: UniversityVerificationModel['selectedMethodId'];
}) {
  return (
    <Card style={styles.methodPickerCard}>
      <Text style={styles.sectionTitle}>인증 방식 선택</Text>
      <View style={styles.methodPickerRow}>
        {VERIFICATION_METHODS.map((method) => {
          const selected = method.id === selectedMethodId;

          return (
            <Pressable
              key={method.id}
              style={[styles.methodPickerButton, selected ? styles.methodPickerButtonSelected : null]}
              onPress={() => onSelectMethod(method.id)}
            >
              <Text style={[styles.methodPickerButtonTitle, selected ? styles.methodPickerButtonTitleSelected : null]}>
                {method.title}
              </Text>
              <Text style={[styles.methodPickerButtonSummary, selected ? styles.methodPickerButtonSummarySelected : null]}>
                {method.id === 'certificate' ? '운영 검토형' : '간편 인증형'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

function VerificationDraftForm({ model }: { model: UniversityVerificationModel }) {
  return (
    <Card style={styles.formCard}>
      <Text style={styles.sectionTitle}>인증 신청 초안</Text>
      <Text style={styles.methodSummary}>{model.selectedMethod.summary}</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>학교명</Text>
        <TextInput
          value={model.universityQuery}
          onChangeText={model.handleUniversityQueryChange}
          placeholder="예: 서울대학교"
          placeholderTextColor="#98A2B3"
          style={styles.input}
        />
        {model.filteredUniversities.length > 0 ? (
          <View style={styles.suggestionWrap}>
            {model.filteredUniversities.map((university) => {
              const selected = university === model.universityQuery;

              return (
                <Pressable
                  key={university}
                  style={[styles.suggestionChip, selected ? styles.suggestionChipSelected : null]}
                  onPress={() => model.handleUniversityQueryChange(university)}
                >
                  <Text style={[styles.suggestionChipText, selected ? styles.suggestionChipTextSelected : null]}>
                    {university}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      {model.selectedMethodId === 'everytime' ? (
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>학교 이메일</Text>
          <TextInput
            value={model.studentEmail}
            onChangeText={model.handleStudentEmailChange}
            placeholder="예: running@university.ac.kr"
            placeholderTextColor="#98A2B3"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={styles.input}
          />
        </View>
      ) : null}

      <View style={styles.checkRowWrap}>
        <VerificationCheckRow
          selected={model.identityChecked}
          label="학교명과 본인 정보를 확인했어요."
          onPress={model.toggleIdentityChecked}
        />
        {model.selectedMethodId === 'certificate' ? (
          <VerificationCheckRow
            selected={model.certificatePrepared}
            label="재학증명서를 준비했어요."
            onPress={model.toggleCertificatePrepared}
          />
        ) : null}
      </View>

      <View style={styles.readinessCard}>
        <Text style={styles.readinessTitle}>현재 준비 상태</Text>
        <Text style={styles.readinessValue}>{model.readinessCount}/2 완료</Text>
        <Text style={styles.readinessHint}>
          {model.selectedMethodId === 'certificate'
            ? '학교명 확인과 재학증명서 준비가 끝나면 신청 초안을 만들 수 있어요.'
            : '학교명 확인과 학교 이메일 입력이 끝나면 신청 초안을 만들 수 있어요.'}
        </Text>
      </View>

      <PrimaryButton label="인증 신청 초안 만들기" onPress={model.handleCreateDraft} />
      {model.draftError ? <Text style={styles.errorText}>{model.draftError}</Text> : null}
    </Card>
  );
}

function VerificationCheckRow({
  label,
  onPress,
  selected,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      style={[styles.checkRow, selected ? styles.checkRowSelected : null]}
      onPress={onPress}
    >
      <View style={[styles.checkMark, selected ? styles.checkMarkSelected : null]} />
      <Text style={styles.checkText}>{label}</Text>
    </Pressable>
  );
}

function VerificationDraftPreview({ model }: { model: UniversityVerificationModel }) {
  return (
    <Card style={styles.previewCard}>
      <Text style={styles.sectionTitle}>신청 미리보기</Text>
      <ListRow>{`인증 방식 · ${model.selectedMethod.title}`}</ListRow>
      <ListRow>{`학교명 · ${model.universityQuery.trim()}`}</ListRow>
      <ListRow>
        {model.selectedMethodId === 'certificate'
          ? '준비물 · 재학증명서 업로드 예정'
          : `학교 이메일 · ${model.studentEmail.trim()}`}
      </ListRow>
      <ListRow>상태 · 실제 업로드/제출 연결 전 초안 준비 완료</ListRow>
      <Text style={styles.previewHint}>
        실제 파일 업로드와 제출 API가 붙으면 지금 만든 흐름 그대로 이어서 연결할 수 있게 해둘게요.
      </Text>
    </Card>
  );
}

function VerificationMethodGuide({
  checklist,
  steps,
}: {
  checklist: string[];
  steps: string[];
}) {
  return (
    <>
      <Card style={styles.methodCard}>
        <Text style={styles.sectionTitle}>이 방식으로 진행할 예정이에요</Text>
        <View style={styles.stepList}>
          {steps.map((step, index) => (
            <View key={step} style={styles.stepRow}>
              <View style={styles.stepDot}>
                <Text style={styles.stepDotText}>{index + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>체크해둘 준비물</Text>
        {checklist.map((item) => (
          <ListRow key={item}>{item}</ListRow>
        ))}
      </Card>
    </>
  );
}

function VerificationBenefitsCard() {
  return (
    <Card>
      <Text style={styles.sectionTitle}>인증이 열리면 이렇게 달라져요</Text>
      <ListRow>대학 리그에서 인증된 학교 기준으로 순위에 참여할 수 있어요.</ListRow>
      <ListRow>프로필에는 인증된 학교만 표시하고, 미인증 학교명은 받지 않을 거예요.</ListRow>
      <ListRow>중복 인증이나 허위 입력 위험을 줄여서 운영 안정성을 높일 수 있어요.</ListRow>
    </Card>
  );
}
