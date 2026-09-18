import { Alert, Platform } from 'react-native';

// 크루 화면의 확인·안내 창. 네이티브는 앱 어디서나 쓰는 Alert 그대로다.
// 웹 미리보기(react-native-web)의 Alert.alert는 빈 함수라, 확인 뒤에 걸린 동작(가입·나가기·
// 내보내기·승인…)을 웹 목에서 눌러 볼 수가 없다 — 웹에서만 브라우저 confirm/alert로 대신한다.

type BrowserDialogs = {
  confirm?: (message: string) => boolean;
  alert?: (message: string) => void;
};

export function confirmCrewAction({
  title,
  message,
  confirmLabel,
  destructive = false,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  if (Platform.OS === 'web') {
    const dialogs = globalThis as BrowserDialogs;
    if (typeof dialogs.confirm === 'function' && dialogs.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: '취소', style: 'cancel' },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}

export function showCrewNotice(title: string, message: string) {
  if (Platform.OS === 'web') {
    (globalThis as BrowserDialogs).alert?.(`${title}\n\n${message}`);
    return;
  }

  Alert.alert(title, message);
}
