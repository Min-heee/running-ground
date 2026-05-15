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
        helperText="닉네임 표시를 선택하면 랭킹, 친구 화면, 기록 화면에 이 이름이 보여요."
        placeholder="닉네임을 입력하세요"
        value={nickname}
        onChangeText={setNickname}
        editable={!submitting}
      />
      <SignupInput
        label="이름 (비공개)"
        helperText="이름은 계정 확인용으로만 저장되고, 앱 화면이나 랭킹에는 공개되지 않아요."
        placeholder="이름을 입력하세요"
        value={realName}
        onChangeText={setRealName}
        editable={!submitting}
      />
      <View style={styles.displayNameCard}>
        <Text style={styles.privacyTitle}>공개 표시 이름 선택</Text>
        <Text style={styles.helperText}>지역 랭킹, 친구 화면, 기록 화면에 어떤 이름으로 보일지 선택해주세요.</Text>
        <View style={styles.displayNameOptionRow}>
          <DisplayNameOption
            selected={displayNamePreference === 'nickname'}
            title="닉네임으로 표시"
            description="러닝 경쟁 화면에 닉네임을 보여줘요."
            disabled={submitting}
            onPress={() => setDisplayNamePreference('nickname')}
          />
          <DisplayNameOption
            selected={displayNamePreference === 'realName'}
            title="본명으로 표시"
            description="지역 랭킹과 기록 화면에 본명을 보여줘요."
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
          랭킹과 친구 화면에는 지금 선택한 공개 표시 이름만 보여요. 이름, 휴대폰 번호, 상세 주소, 생년월일은 계정 확인용 비공개 정보로 처리해요.
        </Text>
      </View>
    </>
  );
}

function DisplayNameOption({
  description,
  disabled,
  onPress,
  selected,
  title,
}: {
  description: string;
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
      <Text style={[styles.displayNameOptionDescription, selected ? styles.displayNameOptionDescriptionSelected : null]}>
        {description}
      </Text>
    </Pressable>
  );
}
