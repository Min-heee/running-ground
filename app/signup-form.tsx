import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { addressCatalog, AddressRegionNode } from '@/features/location/addressCatalog';
import { registerAccount } from '@/lib/session';

const UNIVERSITY_SUGGESTIONS = [
  '서울대학교',
  '연세대학교',
  '고려대학교',
  '성균관대학교',
  '한양대학교',
  '경희대학교',
  '중앙대학교',
  '이화여자대학교',
] as const;

export default function SignupFormScreen() {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [provinceName, setProvinceName] = useState('');
  const [secondaryRegionName, setSecondaryRegionName] = useState('');
  const [tertiaryRegionName, setTertiaryRegionName] = useState('');
  const [universityName, setUniversityName] = useState('');
  const [addressDetail, setAddressDetail] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProvince = useMemo(
    () => addressCatalog.find((region) => region.name === provinceName) ?? null,
    [provinceName],
  );
  const secondaryOptions = selectedProvince?.children ?? [];
  const selectedSecondary = secondaryOptions.find((region) => region.name === secondaryRegionName) ?? null;
  const tertiaryOptions = selectedSecondary?.children ?? [];
  const selectedTertiary = tertiaryOptions.find((region) => region.name === tertiaryRegionName) ?? null;

  const finalRegion = tertiaryOptions.length > 0 ? selectedTertiary : selectedSecondary;
  const finalDistrictName = finalRegion?.name ?? '';
  const selectedAddressLabel = [provinceName, secondaryRegionName, tertiaryRegionName].filter(Boolean).join(' ');

  const handleSignup = async () => {
    setError(null);
    setSubmitting(true);

    try {
      await registerAccount({
        name,
        username,
        password,
        phone,
        provinceName,
        cityName: selectedSecondary?.type === 'city' ? selectedSecondary.name : '',
        districtName: finalDistrictName,
        universityName,
        addressDetail,
        birthDate,
      });
      router.replace('/(tabs)/home');
    } catch (signupError) {
      setError(signupError instanceof Error ? signupError.message : '회원가입에 실패했어.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <AuthHeader title="계정으로 회원가입" subtitle="기본 정보만 입력하면 바로 홈에서 경쟁을 시작할 수 있어요." />

      <Card>
        <View style={styles.form}>
          <Input label="이름" placeholder="이름을 입력하세요" value={name} onChangeText={setName} editable={!submitting} />
          <Input label="아이디" placeholder="아이디를 입력하세요" value={username} onChangeText={setUsername} editable={!submitting} autoCapitalize="none" />
          <Input label="비밀번호" placeholder="비밀번호를 입력하세요" secureTextEntry value={password} onChangeText={setPassword} editable={!submitting} />
          <Input label="핸드폰번호" placeholder="010-0000-0000" keyboardType="phone-pad" value={phone} onChangeText={setPhone} editable={!submitting} />

          <View style={styles.addressGroup}>
            <Text style={styles.label}>사는 지역 선택</Text>
            <Text style={styles.helperText}>서울특별시처럼 광역시는 바로 구를 고르고, 경기도처럼 도는 시를 먼저 고른 뒤 구가 있으면 한 단계 더 내려가면 돼.</Text>

            <SelectionSection
              title="1. 시/도 선택"
              options={addressCatalog}
              selectedName={provinceName}
              disabled={submitting}
              onSelect={(nextProvince) => {
                setProvinceName(nextProvince.name);
                setSecondaryRegionName('');
                setTertiaryRegionName('');
                setAddressDetail('');
              }}
            />

            {selectedProvince ? (
              <SelectionSection
                title={selectedProvince.children?.[0]?.type === 'district' ? '2. 구 선택' : '2. 시/군 선택'}
                options={secondaryOptions}
                selectedName={secondaryRegionName}
                disabled={submitting}
                onSelect={(nextSecondary) => {
                  setSecondaryRegionName(nextSecondary.name);
                  setTertiaryRegionName('');
                  setAddressDetail('');
                }}
              />
            ) : null}

            {selectedSecondary && tertiaryOptions.length > 0 ? (
              <SelectionSection
                title="3. 구 선택"
                options={tertiaryOptions}
                selectedName={tertiaryRegionName}
                disabled={submitting}
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
            <Text style={styles.helperText}>선택사항이야. 학교를 입력하거나 아래 빠른 선택을 누르면, 대학 리그에 바로 집계돼.</Text>
            <Input
              label="대학교"
              placeholder="예: 서울대학교"
              value={universityName}
              onChangeText={setUniversityName}
              editable={!submitting}
            />
            <View style={styles.selectionList}>
              {UNIVERSITY_SUGGESTIONS.map((option) => {
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

          <Pressable style={[styles.primaryButton, submitting ? styles.disabledButton : null]} onPress={handleSignup} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>회원가입하고 시작</Text>}
          </Pressable>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      </Card>
    </Screen>
  );
}

function SelectionSection({
  title,
  options,
  selectedName,
  disabled,
  onSelect,
}: {
  title: string;
  options: AddressRegionNode[];
  selectedName: string;
  disabled?: boolean;
  onSelect: (option: AddressRegionNode) => void;
}) {
  return (
    <View style={styles.selectionSection}>
      <Text style={styles.selectionTitle}>{title}</Text>
      <View style={styles.selectionList}>
        {options.map((option) => {
          const selected = option.name === selectedName;

          return (
            <Pressable
              key={option.name}
              style={[styles.selectionChip, selected && styles.selectionChipSelected, disabled && styles.disabledButton]}
              onPress={() => onSelect(option)}
              disabled={disabled}
            >
              <Text style={[styles.selectionChipText, selected && styles.selectionChipTextSelected]}>{option.name}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Input({
  label,
  placeholder,
  secureTextEntry,
  keyboardType,
  value,
  onChangeText,
  editable = true,
  autoCapitalize,
}: {
  label: string;
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
  label: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 15,
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
  addressGroup: {
    gap: 12,
  },
  selectionSection: {
    gap: 8,
  },
  selectionTitle: {
    color: '#344054',
    fontWeight: '700',
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
