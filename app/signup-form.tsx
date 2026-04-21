import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { AddressRegionNode } from '@/features/location/addressCatalog';
import { buildRegionSelectionState, RegionChipSection } from '@/features/location/RegionSelection';
import { fetchRegionCatalog, fetchUniversityCatalog } from '@/lib/api/services';
import {
  PASSWORD_RULE_DESCRIPTION,
  USERNAME_RULE_DESCRIPTION,
  checkUsernameAvailability,
  getPasswordValidationError,
  getUsernameValidationError,
  normalizeUsername,
  registerAccount,
} from '@/lib/session';

type UsernameCheckState = {
  status: 'idle' | 'checking' | 'available' | 'unavailable' | 'error';
  message: string | null;
  checkedUsername: string;
};

export default function SignupFormScreen() {
  const [nickname, setNickname] = useState('');
  const [realName, setRealName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [phone, setPhone] = useState('');
  const [provinceName, setProvinceName] = useState('');
  const [secondaryRegionName, setSecondaryRegionName] = useState('');
  const [tertiaryRegionName, setTertiaryRegionName] = useState('');
  const [universityName, setUniversityName] = useState('');
  const [regions, setRegions] = useState<AddressRegionNode[]>([]);
  const [universitySuggestions, setUniversitySuggestions] = useState<string[]>([]);
  const [addressDetail, setAddressDetail] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usernameCheck, setUsernameCheck] = useState<UsernameCheckState>({
    status: 'idle',
    message: null,
    checkedUsername: '',
  });
  const normalizedUsername = useMemo(() => normalizeUsername(username), [username]);
  const usernameValidationMessage = useMemo(() => (
    username ? getUsernameValidationError(username) : null
  ), [username]);
  const passwordValidationMessage = useMemo(() => (
    password ? getPasswordValidationError(password) : null
  ), [password]);
  const passwordConfirmMessage = useMemo(() => {
    if (!passwordConfirm) {
      return null;
    }

    return password === passwordConfirm ? null : '비밀번호가 서로 달라요.';
  }, [password, passwordConfirm]);
  const passwordReady = Boolean(password && passwordConfirm && !passwordValidationMessage && !passwordConfirmMessage);

  useEffect(() => {
    Promise.all([fetchRegionCatalog(), fetchUniversityCatalog()])
      .then(([regionCatalog, universityCatalog]) => {
        setRegions(regionCatalog.regions);
        setUniversitySuggestions(universityCatalog.universities);
      })
      .catch((loadError) => {
        setCatalogError(loadError instanceof Error ? loadError.message : '회원가입에 필요한 목록을 불러오지 못했어요.');
      })
      .finally(() => setCatalogLoading(false));
  }, []);

  const {
    selectedProvince,
    secondaryOptions,
    selectedSecondary,
    tertiaryOptions,
    finalRegion,
    finalCityName,
    finalDistrictName,
    selectedAddressLabel,
  } = useMemo(
    () => buildRegionSelectionState(regions, provinceName, secondaryRegionName, tertiaryRegionName),
    [regions, provinceName, secondaryRegionName, tertiaryRegionName],
  );
  const checkingUsername = usernameCheck.status === 'checking';
  const requiredProfileReady = Boolean(
    nickname.trim()
    && realName.trim()
    && normalizedUsername
    && !usernameValidationMessage
    && phone.replace(/\D/g, '').length >= 10
    && selectedAddressLabel
    && addressDetail.trim()
    && /^\d{4}-\d{2}-\d{2}$/.test(birthDate.trim()),
  );

  const handleUsernameChange = (value: string) => {
    const nextUsername = value.trim().toLowerCase();
    setUsername(nextUsername);

    const nextNormalizedUsername = normalizeUsername(nextUsername);

    setUsernameCheck((currentState) => (
      currentState.checkedUsername === nextNormalizedUsername
        ? currentState
        : {
            status: 'idle',
            message: null,
            checkedUsername: '',
          }
    ));
  };

  const handleCheckUsername = async () => {
    const usernameValidationError = getUsernameValidationError(normalizedUsername);

    if (usernameValidationError) {
      setUsernameCheck({
        status: 'error',
        message: usernameValidationError,
        checkedUsername: '',
      });
      return false;
    }

    setUsernameCheck({
      status: 'checking',
      message: '아이디를 확인하고 있어요.',
      checkedUsername: normalizedUsername,
    });

    try {
      const result = await checkUsernameAvailability(normalizedUsername);

      setUsernameCheck({
        status: result.available ? 'available' : 'unavailable',
        message: result.message,
        checkedUsername: result.username,
      });

      return result.available;
    } catch (usernameError) {
      setUsernameCheck({
        status: 'error',
        message: usernameError instanceof Error ? usernameError.message : '아이디 중복 확인에 실패했어요.',
        checkedUsername: normalizedUsername,
      });
      return false;
    }
  };

  const handleSignup = async () => {
    setError(null);
    setSubmitting(true);

    try {
      const passwordError = getPasswordValidationError(password);

      if (passwordError) {
        throw new Error(passwordError);
      }

      if (password !== passwordConfirm) {
        throw new Error('비밀번호 확인이 일치하지 않아요.');
      }

      const usernameReady = usernameCheck.status === 'available' && usernameCheck.checkedUsername === normalizedUsername;

      if (!usernameReady) {
        const available = await handleCheckUsername();

        if (!available) {
          throw new Error('사용 가능한 아이디인지 먼저 확인해주세요.');
        }
      }

      await registerAccount({
        nickname,
        realName,
        username,
        password,
        phone,
        provinceName,
        cityName: finalCityName,
        districtName: finalDistrictName,
        universityName,
        addressDetail,
        birthDate,
      });
      router.replace('/(tabs)/home');
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : '회원가입에 실패했어요.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <AuthHeader
        title="계정으로 회원가입"
        subtitle="공개 닉네임과 비공개 이름을 포함한 기본 정보만 입력하면 바로 홈에서 경쟁을 시작할 수 있어요."
        showBack
        backHref="/signup"
      />

      <Card>
        <View style={styles.form}>
          {catalogLoading ? <ActivityIndicator size="small" color="#6D5EF7" /> : null}
          {catalogError ? <Text style={styles.errorText}>{catalogError}</Text> : null}

          <Input
            label="닉네임"
            helperText="실명을 공개하고 싶지 않다면 닉네임을 입력해주세요. 다른 사용자에게는 닉네임만 보여요."
            placeholder="닉네임을 입력하세요"
            value={nickname}
            onChangeText={setNickname}
            editable={!submitting}
          />
          <Input
            label="이름 (비공개)"
            helperText="이름은 계정 확인용으로만 저장되고, 앱 화면이나 랭킹에는 공개되지 않아요."
            placeholder="이름을 입력하세요"
            value={realName}
            onChangeText={setRealName}
            editable={!submitting}
          />
          <View style={styles.privacyCard}>
            <Text style={styles.privacyTitle}>공개되는 정보</Text>
            <Text style={styles.privacyText}>랭킹과 친구 화면에는 닉네임만 보여요. 이름, 휴대폰 번호, 상세 주소, 생년월일은 계정 확인용 비공개 정보로 처리해요.</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>아이디</Text>
            <Text style={styles.helperText}>{USERNAME_RULE_DESCRIPTION} 입력 후 중복 확인을 해주세요.</Text>
            <View style={styles.inlineInputRow}>
              <TextInput
                placeholder="아이디를 입력하세요"
                placeholderTextColor="#98A2B3"
                style={[styles.input, styles.inlineInput, !submitting && !checkingUsername ? null : styles.inputDisabled]}
                value={username}
                onChangeText={handleUsernameChange}
                editable={!submitting && !checkingUsername}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                style={[styles.secondaryActionButton, (submitting || checkingUsername) && styles.disabledButton]}
                onPress={handleCheckUsername}
                disabled={submitting || checkingUsername}
              >
                <Text style={styles.secondaryActionButtonText}>{checkingUsername ? '확인 중' : '중복 확인'}</Text>
              </Pressable>
            </View>
            {usernameValidationMessage ? <Text style={[styles.statusText, styles.statusTextError]}>{usernameValidationMessage}</Text> : null}
            {usernameCheck.message ? (
              <Text
                style={[
                  styles.statusText,
                  usernameCheck.status === 'available'
                    ? styles.statusTextSuccess
                    : usernameCheck.status === 'checking'
                      ? styles.statusTextNeutral
                      : styles.statusTextError,
                ]}
              >
                {usernameCheck.message}
              </Text>
            ) : null}
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>비밀번호</Text>
              <Pressable onPress={() => setPasswordVisible((current) => !current)} disabled={submitting}>
                <Text style={styles.inlineToggleText}>{passwordVisible ? '숨김' : '보기'}</Text>
              </Pressable>
            </View>
            <Text style={styles.helperText}>{PASSWORD_RULE_DESCRIPTION}</Text>
            <TextInput
              placeholder="비밀번호를 입력하세요"
              placeholderTextColor="#98A2B3"
              style={[styles.input, submitting && styles.inputDisabled]}
              secureTextEntry={!passwordVisible}
              value={password}
              onChangeText={setPassword}
              editable={!submitting}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              placeholder="비밀번호를 한 번 더 입력하세요"
              placeholderTextColor="#98A2B3"
              style={[styles.input, submitting && styles.inputDisabled]}
              secureTextEntry={!passwordVisible}
              value={passwordConfirm}
              onChangeText={setPasswordConfirm}
              editable={!submitting}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.validationList}>
              <ValidationItem label="8자 이상" complete={password.length >= 8} />
              <ValidationItem label="영문과 숫자 포함" complete={/[A-Za-z]/.test(password) && /\d/.test(password)} />
              <ValidationItem label="비밀번호 확인 일치" complete={passwordReady} />
            </View>
            {passwordValidationMessage ? <Text style={[styles.statusText, styles.statusTextError]}>{passwordValidationMessage}</Text> : null}
            {passwordConfirmMessage ? <Text style={[styles.statusText, styles.statusTextError]}>{passwordConfirmMessage}</Text> : null}
          </View>
          <Input label="핸드폰번호" placeholder="010-0000-0000" keyboardType="phone-pad" value={phone} onChangeText={setPhone} editable={!submitting} />

          <View style={styles.addressGroup}>
            <Text style={styles.label}>사는 지역 선택</Text>
            <Text style={styles.helperText}>서울특별시처럼 광역시는 바로 구를 고르고, 경기도처럼 도는 시를 먼저 고른 뒤 구가 있으면 한 단계 더 내려가면 돼요.</Text>

            <RegionChipSection
              title="1. 시/도 선택"
              options={regions}
              selectedName={provinceName}
              disabled={submitting || catalogLoading}
              onSelect={(nextProvince) => {
                setProvinceName(nextProvince.name);
                setSecondaryRegionName('');
                setTertiaryRegionName('');
                setAddressDetail('');
              }}
            />

            {selectedProvince ? (
              <RegionChipSection
                title={selectedProvince.children?.[0]?.type === 'district' ? '2. 구 선택' : '2. 시/군 선택'}
                options={secondaryOptions}
                selectedName={secondaryRegionName}
                disabled={submitting || catalogLoading}
                onSelect={(nextSecondary) => {
                  setSecondaryRegionName(nextSecondary.name);
                  setTertiaryRegionName('');
                  setAddressDetail('');
                }}
              />
            ) : null}

            {selectedSecondary && tertiaryOptions.length > 0 ? (
              <RegionChipSection
                title="3. 구 선택"
                options={tertiaryOptions}
                selectedName={tertiaryRegionName}
                disabled={submitting || catalogLoading}
                onSelect={(nextTertiary) => {
                  setTertiaryRegionName(nextTertiary.name);
                  setAddressDetail('');
                }}
              />
            ) : null}

            {selectedAddressLabel ? (
              <View style={styles.selectedAddressCard}>
                <Text style={styles.selectedAddressLabel}>현재 선택</Text>
                <Text style={styles.selectedAddressValue}>{selectedAddressLabel}</Text>
              </View>
            ) : null}

            {finalRegion ? (
              <Input
                label="상세 주소"
                placeholder="예: 테헤란로 123, 101동 1203호"
                value={addressDetail}
                onChangeText={setAddressDetail}
                editable={!submitting}
              />
            ) : null}
          </View>

          <View style={styles.addressGroup}>
            <Text style={styles.label}>대학교 선택</Text>
            <Text style={styles.helperText}>선택사항이에요. 학교를 입력하거나 아래 빠른 선택을 누르면 대학 리그에 바로 집계돼요.</Text>
            <Input
              label="대학교"
              placeholder="예: 서울대학교"
              value={universityName}
              onChangeText={setUniversityName}
              editable={!submitting}
            />
            {universitySuggestions.length === 0 ? (
              <Text style={styles.helperText}>아직 등록된 대학이 많지 않아요. 없으면 직접 입력하면 바로 추가돼요.</Text>
            ) : null}
            <View style={styles.selectionList}>
              {universitySuggestions.map((option) => {
                const selected = option === universityName;

                return (
                  <Pressable
                    key={option}
                    style={[styles.selectionChip, selected && styles.selectionChipSelected, submitting && styles.disabledButton]}
                    onPress={() => setUniversityName(option)}
                    disabled={submitting}
                  >
                    <Text style={[styles.selectionChipText, selected && styles.selectionChipTextSelected]}>{option}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Input label="생년월일" placeholder="예: 1990-01-01" value={birthDate} onChangeText={setBirthDate} editable={!submitting} />

          <View style={styles.readyCard}>
            <Text style={styles.readyTitle}>가입 준비 상태</Text>
            <ValidationItem label="기본 정보와 지역 입력" complete={requiredProfileReady} />
            <ValidationItem label="아이디 중복 확인 완료" complete={usernameCheck.status === 'available' && usernameCheck.checkedUsername === normalizedUsername} />
            <ValidationItem label="비밀번호 조건 충족" complete={passwordReady} />
          </View>

          <Pressable
            style={[styles.primaryButton, (submitting || catalogLoading || Boolean(catalogError)) ? styles.disabledButton : null]}
            onPress={handleSignup}
            disabled={submitting || catalogLoading || Boolean(catalogError)}
          >
            {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>회원가입하고 시작</Text>}
          </Pressable>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      </Card>
    </Screen>
  );
}

function ValidationItem({ label, complete }: { label: string; complete: boolean }) {
  return (
    <View style={styles.validationItem}>
      <View style={[styles.validationDot, complete ? styles.validationDotComplete : styles.validationDotPending]} />
      <Text style={[styles.validationText, complete ? styles.validationTextComplete : styles.validationTextPending]}>{label}</Text>
    </View>
  );
}

function Input({
  label,
  helperText,
  placeholder,
  secureTextEntry,
  keyboardType,
  value,
  onChangeText,
  editable = true,
  autoCapitalize,
}: {
  label: string;
  helperText?: string;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'phone-pad';
  value: string;
  onChangeText: (value: string) => void;
  editable?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
      <TextInput
        placeholder={placeholder}
        placeholderTextColor="#98A2B3"
        style={[styles.input, !editable && styles.inputDisabled]}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType ?? 'default'}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14 },
  inputGroup: { gap: 8 },
  privacyCard: {
    gap: 5,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  privacyTitle: {
    color: '#111827',
    fontWeight: '800',
  },
  privacyText: {
    color: '#667085',
    lineHeight: 20,
  },
  inlineInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 15,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  inlineToggleText: {
    color: '#6D5EF7',
    fontWeight: '800',
  },
  helperText: {
    color: '#667085',
    lineHeight: 20,
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
  inputDisabled: {
    opacity: 0.7,
  },
  inlineInput: {
    flex: 1,
  },
  secondaryActionButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionButtonText: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 14,
  },
  statusText: {
    fontWeight: '700',
    lineHeight: 20,
  },
  statusTextSuccess: {
    color: '#067647',
  },
  statusTextNeutral: {
    color: '#475467',
  },
  statusTextError: {
    color: '#B42318',
  },
  validationList: {
    gap: 7,
  },
  validationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  validationDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  validationDotComplete: {
    backgroundColor: '#12B76A',
  },
  validationDotPending: {
    backgroundColor: '#D0D5DD',
  },
  validationText: {
    fontWeight: '700',
    lineHeight: 19,
  },
  validationTextComplete: {
    color: '#067647',
  },
  validationTextPending: {
    color: '#667085',
  },
  readyCard: {
    gap: 8,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#EAECF0',
  },
  readyTitle: {
    color: '#111827',
    fontWeight: '800',
  },
  addressGroup: {
    gap: 12,
  },
  selectionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectionChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  selectionChipSelected: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6D5EF7',
  },
  selectionChipText: {
    color: '#344054',
    fontWeight: '700',
  },
  selectionChipTextSelected: {
    color: '#4338CA',
  },
  selectedAddressCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  selectedAddressLabel: {
    color: '#475467',
    fontWeight: '700',
    fontSize: 12,
  },
  selectedAddressValue: {
    color: '#111827',
    fontWeight: '800',
  },
  primaryButton: {
    backgroundColor: '#6D5EF7',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  disabledButton: {
    opacity: 0.6,
  },
  errorText: {
    color: '#B42318',
    fontWeight: '700',
    lineHeight: 20,
  },
});
