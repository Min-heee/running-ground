import { StyleSheet, Text, View, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { Link } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { useLoginScreen } from '@/features/auth/hooks/useLoginScreen';

export default function LoginScreen() {
  const {
    error,
    handleCheckServer,
    handleLogin,
    handleUsernameChange,
    loginReady,
    password,
    passwordVisible,
    serverCheck,
    setPassword,
    setPasswordVisible,
    submitting,
    username,
  } = useLoginScreen();

  return (
    <Screen>
      <AuthHeader title="로그인" subtitle="로그인하면 바로 홈으로 들어가 경쟁을 시작할 수 있어요." showBack backHref="/onboarding" />

      <Card>
        <Text style={styles.sectionTitle}>계정으로 로그인</Text>
        <View style={styles.form}>
          <TextInput
            placeholder="아이디"
            placeholderTextColor="#98A2B3"
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={handleUsernameChange}
            editable={!submitting}
          />
          <View style={styles.passwordRow}>
            <TextInput
              placeholder="비밀번호"
              placeholderTextColor="#98A2B3"
              style={[styles.input, styles.passwordInput]}
              secureTextEntry={!passwordVisible}
              value={password}
              onChangeText={setPassword}
              editable={!submitting}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable style={styles.passwordToggle} onPress={() => setPasswordVisible((current) => !current)} disabled={submitting}>
              <Text style={styles.passwordToggleText}>{passwordVisible ? '숨김' : '보기'}</Text>
            </Pressable>
          </View>
          <Text style={styles.helperText}>아이디는 소문자로 저장돼요. 공백 없이 입력해주세요.</Text>
          <Pressable style={[styles.accountButton, (!loginReady || submitting) ? styles.disabledButton : null]} onPress={handleLogin} disabled={!loginReady || submitting}>
            {submitting ? <ActivityIndicator color="#111827" /> : <Text style={styles.accountButtonText}>로그인하고 시작</Text>}
          </Pressable>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      </Card>

      <Card>
        <View style={styles.serverCardHeader}>
          <Text style={styles.serverTitle}>서버 연결</Text>
          <Pressable onPress={handleCheckServer} disabled={serverCheck.status === 'checking'}>
            <Text style={styles.serverAction}>{serverCheck.status === 'checking' ? '확인 중' : '다시 확인'}</Text>
          </Pressable>
        </View>
        <Text
          style={[
            styles.serverText,
            serverCheck.status === 'ok'
              ? styles.serverTextOk
              : serverCheck.status === 'error'
                ? styles.serverTextError
                : null,
          ]}
        >
          {serverCheck.message}
        </Text>
      </Card>

      <View style={styles.footer}>
        <Text style={styles.footerText}>처음이신가요?</Text>
        <Link href="/signup" asChild>
          <Pressable>
            <Text style={styles.footerLink}>회원가입</Text>
          </Pressable>
        </Link>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>계정이 기억나지 않나요?</Text>
        <Link href={'/account-recovery' as never} asChild>
          <Pressable>
            <Text style={styles.footerLink}>아이디/비밀번호 찾기</Text>
          </Pressable>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  form: { gap: 12, marginTop: 8 },
  helperText: {
    color: '#667085',
    lineHeight: 19,
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
  passwordRow: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 64,
  },
  passwordToggle: {
    position: 'absolute',
    right: 10,
    top: 9,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  passwordToggleText: {
    color: '#344054',
    fontWeight: '800',
    fontSize: 12,
  },
  accountButton: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  accountButtonText: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 15,
  },
  serverCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  serverTitle: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 15,
  },
  serverAction: {
    color: '#6D5EF7',
    fontWeight: '800',
    fontSize: 13,
  },
  serverText: {
    marginTop: 8,
    color: '#667085',
    lineHeight: 19,
    fontSize: 12,
  },
  serverTextOk: {
    color: '#067647',
  },
  serverTextError: {
    color: '#B42318',
  },
  disabledButton: {
    opacity: 0.6,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 8,
  },
  footerText: {
    color: '#667085',
  },
  footerLink: {
    color: '#6D5EF7',
    fontWeight: '700',
  },
  errorText: {
    color: '#B42318',
    fontWeight: '700',
    lineHeight: 20,
  },
});
