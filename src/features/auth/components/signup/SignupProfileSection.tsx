import { Pressable, Text, View } from 'react-native';
import type { SignupFormModel } from './types';
import { SignupInput } from './SignupFormPrimitives';
import { signupFormStyles as styles } from './signupFormStyles';

type SignupProfileSectionProps = Pick<
  SignupFormModel,
  | 'displayNamePreference'
  | 'nickname'
  | 'publicDisplayName'
  | 'realName'
  | 'setDisplayNamePreference'
  | 'setNickname'
  | 'setRealName'
  | 'submitting'
>;

export function SignupProfileSection({
  displayNamePreference,
  nickname,
  publicDisplayName,
  realName,
  setDisplayNamePreference,
  setNickname,
  setRealName,
  submitting,
}: SignupProfileSectionProps) {
  return (
    <>
      <SignupInput
        label="닉네임"
        placeholder="닉네임을 입력하세요"
        value={nickname}
        onChangeText={setNickname}
        editable={!submitting}
      />
      <SignupInput
        label="이름"
        placeholder="이름을 입력하세요"
        value={realName}
        onChangeText={setRealName}
        editable={!submitting}
      />
      <View style={styles.displayNameCard}>
        <Text style={styles.privacyTitle}>공개 표시 이름 선택</Text>
        <View style={styles.displayNameOptionRow}>
          <DisplayNameOption
            selected={displayNamePreference === 'nickname'}
            title="닉네임"
            disabled={submitting}
            onPress={() => setDisplayNamePreference('nickname')}
          />
          <DisplayNameOption
            selected={displayNamePreference === 'realName'}
            title="본명"
            disabled={submitting}
            onPress={() => setDisplayNamePreference('realName')}
          />
        </View>
        <View style={styles.displayNamePreviewCard}>
          <Text style={styles.displayNamePreviewLabel}>현재 공개 표시 이름</Text>
          <Text style={styles.displayNamePreviewValue}>{publicDisplayName || '아직 선택 전'}</Text>
        </View>
      </View>
      <View style={styles.privacyCard}>
        <Text style={styles.privacyTitle}>공개되는 정보</Text>
        <Text style={styles.privacyText}>
          랭킹과 친구 화면에는 지금 선택한 공개 표시 이름만 보여요. 이름과 휴대폰 번호는 계정 확인용 비공개 정보로 처리해요.
        </Text>
      </View>
    </>
  );
}

function DisplayNameOption({
  disabled,
  onPress,
  selected,
  title,
}: {
  disabled: boolean;
  onPress: () => void;
  selected: boolean;
  title: string;
}) {
  return (
    <Pressable
      style={[styles.displayNameOption, selected ? styles.displayNameOptionSelected : null]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.displayNameOptionTitle, selected ? styles.displayNameOptionTitleSelected : null]}>
        {title}
      </Text>
    </Pressable>
  );
}
