import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { ListRow } from '@/components/ui/ListRow';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { fetchMyProfile, fetchUniversityCatalog } from '@/services';
import { MyProfileResponse } from '@/lib/api/types';

type VerificationMethodId = 'certificate' | 'everytime';

type VerificationMethod = {
  id: VerificationMethodId;
  title: string;
  summary: string;
  steps: string[];
  checklist: string[];
};

const VERIFICATION_METHODS: VerificationMethod[] = [
  {
    id: 'certificate',
    title: '재학증명서 인증',
    summary: '학교가 발급한 재학증명서를 올려서 인증하는 방식이에요. 출시 초기에 가장 안정적으로 붙이기 좋은 경로예요.',
    steps: [
      '학교 포털이나 증명서 발급 서비스에서 최신 재학증명서를 준비해요.',
      '학교명과 함께 파일을 올리면 운영 검토 후 인증을 반영해요.',
      '인증이 끝나면 대학 리그와 프로필에 자동으로 연결돼요.',
    ],
    checklist: [
      '최근 발급한 재학증명서 준비',
      '학교명 확인',
      '가려야 하는 개인정보 범위 확인',
    ],
  },
  {
    id: 'everytime',
    title: '에브리타임 방식 인증',
    summary: '에브리타임처럼 학교 이메일이나 학교 인증 완료 상태를 확인하는 간편 인증 방식도 같이 준비할 예정이에요.',
    steps: [
      '지원 학교와 인증 조건이 정리되면 학교 이메일 또는 서비스 인증으로 진행해요.',
      '인증이 끝나면 대학명이 프로필과 대학 리그에 안전하게 반영돼요.',
      '인증 전까지는 임의 입력 없이 비인증 상태를 유지해요.',
    ],
    checklist: [
      '학교 이메일 확인',
      '지원 학교 여부 확인',
      '서비스 연동 또는 확인 코드 입력 준비',
    ],
  },
];

export default function UniversityVerificationScreen() {
  const [profile, setProfile] = useState<MyProfileResponse | null>(null);
  const [universities, setUniversities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMethodId, setSelectedMethodId] = useState<VerificationMethodId>('certificate');
  const [universityQuery, setUniversityQuery] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [certificatePrepared, setCertificatePrepared] = useState(false);
  const [identityChecked, setIdentityChecked] = useState(false);
  const [draftCreated, setDraftCreated] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchMyProfile(), fetchUniversityCatalog()])
      .then(([nextProfile, universityCatalog]) => {
        setProfile(nextProfile);
        setUniversities(universityCatalog.universities);
        setUniversityQuery(nextProfile.universityName ?? '');
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : '대학교 인증 정보를 불러오지 못했어요.');
      })
      .finally(() => setLoading(false));
  }, []);

  const selectedMethod = useMemo(
    () => VERIFICATION_METHODS.find((method) => method.id === selectedMethodId) ?? VERIFICATION_METHODS[0],
    [selectedMethodId],
  );
  const filteredUniversities = useMemo(() => {
    const query = universityQuery.trim();

    if (!query) {
      return universities.slice(0, 8);
    }

    return universities
      .filter((university) => university.includes(query))
      .slice(0, 8);
  }, [universityQuery, universities]);
  const readinessCount = [identityChecked, selectedMethodId === 'certificate' ? certificatePrepared : Boolean(studentEmail.trim())]
    .filter(Boolean)
    .length;

  const handleCreateDraft = () => {
    setDraftError(null);

    if (!universityQuery.trim()) {
      setDraftCreated(false);
      setDraftError('학교명을 먼저 적어주세요.');
      return;
    }

    if (!identityChecked) {
      setDraftCreated(false);
      setDraftError('인증 전 확인 사항을 체크해주세요.');
      return;
    }

    if (selectedMethodId === 'certificate' && !certificatePrepared) {
      setDraftCreated(false);
      setDraftError('재학증명서 준비 여부를 체크해주세요.');
      return;
    }

    if (selectedMethodId === 'everytime' && !studentEmail.trim()) {
      setDraftCreated(false);
      setDraftError('학교 이메일을 입력해주세요.');
      return;
    }

    setDraftCreated(true);
  };

  return (
    <Screen>
      <AuthHeader
        title="대학교 인증"
        subtitle="대학교는 가입 단계에서 바로 받지 않고, 인증 기반으로만 연결할 예정이에요."
        showBack
        backHref="/(tabs)/mypage"
      />

      {loading ? <ActivityIndicator size="large" color="#6D5EF7" /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {!loading && profile ? (
        <>
          <Card style={styles.statusCard}>
            <Text style={styles.sectionTitle}>현재 상태</Text>
            <View style={styles.statusBadge}>
              <Text style={styles.statusLabel}>{profile.universityName ? '인증 연결됨' : '인증 전'}</Text>
            </View>
            <Text style={styles.statusValue}>
              {profile.universityName ? profile.universityName : '아직 인증된 대학교가 없어요.'}
            </Text>
            <Text style={styles.statusHint}>
              출시 초기에는 임의 입력보다 인증 정확도를 우선해서, 인증된 학교만 대학 리그에 반영하는 방향으로 갈게요.
            </Text>
          </Card>

          <Card style={styles.methodPickerCard}>
            <Text style={styles.sectionTitle}>인증 방식 선택</Text>
            <View style={styles.methodPickerRow}>
              {VERIFICATION_METHODS.map((method) => {
                const selected = method.id === selectedMethodId;

                return (
                  <Pressable
                    key={method.id}
                    style={[styles.methodPickerButton, selected ? styles.methodPickerButtonSelected : null]}
                    onPress={() => {
                      setSelectedMethodId(method.id);
                      setDraftCreated(false);
                      setDraftError(null);
                    }}
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

          <Card style={styles.formCard}>
            <Text style={styles.sectionTitle}>인증 신청 초안</Text>
            <Text style={styles.methodSummary}>{selectedMethod.summary}</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>학교명</Text>
              <TextInput
                value={universityQuery}
                onChangeText={(nextValue) => {
                  setUniversityQuery(nextValue);
                  setDraftCreated(false);
                  setDraftError(null);
                }}
                placeholder="예: 서울대학교"
                placeholderTextColor="#98A2B3"
                style={styles.input}
              />
              {filteredUniversities.length > 0 ? (
                <View style={styles.suggestionWrap}>
                  {filteredUniversities.map((university) => {
                    const selected = university === universityQuery;

                    return (
                      <Pressable
                        key={university}
                        style={[styles.suggestionChip, selected ? styles.suggestionChipSelected : null]}
                        onPress={() => {
                          setUniversityQuery(university);
                          setDraftCreated(false);
                          setDraftError(null);
                        }}
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

            {selectedMethodId === 'everytime' ? (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>학교 이메일</Text>
                <TextInput
                  value={studentEmail}
                  onChangeText={(nextValue) => {
                    setStudentEmail(nextValue);
                    setDraftCreated(false);
                    setDraftError(null);
                  }}
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
              <Pressable
                style={[styles.checkRow, identityChecked ? styles.checkRowSelected : null]}
                onPress={() => {
                  setIdentityChecked((current) => !current);
                  setDraftCreated(false);
                  setDraftError(null);
                }}
              >
                <View style={[styles.checkMark, identityChecked ? styles.checkMarkSelected : null]} />
                <Text style={styles.checkText}>학교명과 본인 정보를 확인했어요.</Text>
              </Pressable>

              {selectedMethodId === 'certificate' ? (
                <Pressable
                  style={[styles.checkRow, certificatePrepared ? styles.checkRowSelected : null]}
                  onPress={() => {
                    setCertificatePrepared((current) => !current);
                    setDraftCreated(false);
                    setDraftError(null);
                  }}
                >
                  <View style={[styles.checkMark, certificatePrepared ? styles.checkMarkSelected : null]} />
                  <Text style={styles.checkText}>재학증명서를 준비했어요.</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.readinessCard}>
              <Text style={styles.readinessTitle}>현재 준비 상태</Text>
              <Text style={styles.readinessValue}>{readinessCount}/2 완료</Text>
              <Text style={styles.readinessHint}>
                {selectedMethodId === 'certificate'
                  ? '학교명 확인과 재학증명서 준비가 끝나면 신청 초안을 만들 수 있어요.'
                  : '학교명 확인과 학교 이메일 입력이 끝나면 신청 초안을 만들 수 있어요.'}
              </Text>
            </View>

            <PrimaryButton label="인증 신청 초안 만들기" onPress={handleCreateDraft} />
            {draftError ? <Text style={styles.errorText}>{draftError}</Text> : null}
          </Card>

          {draftCreated ? (
            <Card style={styles.previewCard}>
              <Text style={styles.sectionTitle}>신청 미리보기</Text>
              <ListRow>{`인증 방식 · ${selectedMethod.title}`}</ListRow>
              <ListRow>{`학교명 · ${universityQuery.trim()}`}</ListRow>
              <ListRow>
                {selectedMethodId === 'certificate'
                  ? '준비물 · 재학증명서 업로드 예정'
                  : `학교 이메일 · ${studentEmail.trim()}`}
              </ListRow>
              <ListRow>상태 · 실제 업로드/제출 연결 전 초안 준비 완료</ListRow>
              <Text style={styles.previewHint}>
                실제 파일 업로드와 제출 API가 붙으면 지금 만든 흐름 그대로 이어서 연결할 수 있게 해둘게요.
              </Text>
            </Card>
          ) : null}

          <Card style={styles.methodCard}>
            <Text style={styles.sectionTitle}>이 방식으로 진행할 예정이에요</Text>
            <View style={styles.stepList}>
              {selectedMethod.steps.map((step, index) => (
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
            {selectedMethod.checklist.map((item) => (
              <ListRow key={item}>{item}</ListRow>
            ))}
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>인증이 열리면 이렇게 달라져요</Text>
            <ListRow>대학 리그에서 인증된 학교 기준으로 순위에 참여할 수 있어요.</ListRow>
            <ListRow>프로필에는 인증된 학교만 표시하고, 미인증 학교명은 받지 않을 거예요.</ListRow>
            <ListRow>중복 인증이나 허위 입력 위험을 줄여서 운영 안정성을 높일 수 있어요.</ListRow>
          </Card>

          <SecondaryButton label="마이페이지로 돌아가기" onPress={() => router.replace('/(tabs)/mypage')} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusCard: {
    gap: 12,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusLabel: {
    color: '#4338CA',
    fontWeight: '800',
    fontSize: 12,
  },
  statusValue: {
    color: '#101828',
    fontSize: 22,
    fontWeight: '800',
  },
  statusHint: {
    color: '#667085',
    lineHeight: 21,
  },
  methodPickerCard: {
    gap: 12,
  },
  methodPickerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  methodPickerButton: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D0D5DD',
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 4,
  },
  methodPickerButtonSelected: {
    borderColor: '#6D5EF7',
    backgroundColor: '#EEF2FF',
  },
  methodPickerButtonTitle: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 15,
  },
  methodPickerButtonTitleSelected: {
    color: '#4338CA',
  },
  methodPickerButtonSummary: {
    color: '#667085',
    fontSize: 12,
    lineHeight: 18,
  },
  methodPickerButtonSummarySelected: {
    color: '#5B4FCF',
  },
  formCard: {
    gap: 12,
  },
  methodSummary: {
    color: '#667085',
    lineHeight: 21,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: '#111827',
  },
  suggestionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  suggestionChipSelected: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6D5EF7',
  },
  suggestionChipText: {
    color: '#344054',
    fontWeight: '700',
    fontSize: 13,
  },
  suggestionChipTextSelected: {
    color: '#4338CA',
  },
  checkRowWrap: {
    gap: 10,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
  },
  checkRowSelected: {
    backgroundColor: '#F8FAFC',
    borderColor: '#6D5EF7',
  },
  checkMark: {
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#D0D5DD',
    backgroundColor: '#FFFFFF',
  },
  checkMarkSelected: {
    borderColor: '#6D5EF7',
    backgroundColor: '#6D5EF7',
  },
  checkText: {
    flex: 1,
    color: '#344054',
    fontWeight: '700',
    lineHeight: 20,
  },
  readinessCard: {
    gap: 4,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  readinessTitle: {
    color: '#475467',
    fontWeight: '700',
    fontSize: 12,
  },
  readinessValue: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 20,
  },
  readinessHint: {
    color: '#667085',
    lineHeight: 20,
  },
  previewCard: {
    gap: 10,
  },
  previewHint: {
    color: '#667085',
    lineHeight: 20,
  },
  methodCard: {
    gap: 12,
  },
  stepList: {
    gap: 10,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepDotText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  stepText: {
    flex: 1,
    color: '#344054',
    lineHeight: 20,
  },
  errorText: {
    color: '#B42318',
    fontWeight: '700',
    lineHeight: 20,
  },
});
