import { useCallback, useState } from 'react';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { TabHeader } from '@/components/ui/TabHeader';
import { isRunPossiblyActive } from '@/features/home/hooks/useOtaUpdatePrompt';
import { startTour } from '@/features/tour/tourStore';
import { fetchInbox } from '@/services';
import { toggleThemeMode } from '@/theme/themeMode';
import { colors, getAppliedThemeMode, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

export function HomeHeader() {
  const [unreadCount, setUnreadCount] = useState(0);

  useFocusEffect(useCallback(() => {
    let cancelled = false;

    fetchInbox()
      .then((payload) => {
        if (!cancelled) {
          setUnreadCount(payload.unreadCount);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUnreadCount(0);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []));

  const openAnnouncements = useCallback(() => {
    router.push({ pathname: '/notification-center', params: { tab: 'announcements' } });
  }, []);
  const openNotifications = useCallback(() => {
    router.push({ pathname: '/notification-center', params: { tab: 'notifications' } });
  }, []);
  const handleStartTour = useCallback(() => {
    // 투어는 탭을 자동으로 옮겨 다닌다 — 러닝/대결 중엔 화면 이탈이 위험하므로 차단
    // (테마 토글과 같은 fail-closed 규칙).
    if (isRunPossiblyActive()) {
      Alert.alert('사용 방법', '달리기나 대결이 진행 중일 때는 볼 수 없어요. 끝난 뒤 다시 열어 주세요.');
      return;
    }
    startTour();
  }, []);
  const handleToggleTheme = useCallback(() => {
    // Same fail-closed rule as the OTA prompt: the toggle triggers a full JS reload,
    // which must never fire while a run/match could be live.
    if (isRunPossiblyActive()) {
      Alert.alert('테마 변경', '달리기나 대결이 진행 중일 때는 테마를 바꿀 수 없어요. 끝난 뒤 다시 시도해 주세요.');
      return;
    }
    void toggleThemeMode();
  }, []);

  return (
    <TabHeader
      title="홈"
      right={
        <>
          <Pressable
            accessibilityLabel="사용 방법 보기"
            accessibilityRole="button"
            onPress={handleStartTour}
            style={styles.iconButton}
          >
            <Feather name="help-circle" size={fontSizes.metric} color={colors.textPrimary} />
          </Pressable>
          <Pressable
            accessibilityLabel={getAppliedThemeMode() === 'dark' ? '밝은 테마로 바꾸기' : '어두운 테마로 바꾸기'}
            accessibilityRole="button"
            onPress={handleToggleTheme}
            style={styles.iconButton}
          >
            <Feather
              name={getAppliedThemeMode() === 'dark' ? 'sun' : 'moon'}
              size={fontSizes.metric}
              color={colors.textPrimary}
            />
          </Pressable>
          <Pressable
            accessibilityLabel="공지사항 열기"
            accessibilityRole="button"
            onPress={openAnnouncements}
            style={styles.iconButton}
          >
            <MaterialCommunityIcons name="bullhorn-outline" size={fontSizes.metric} color={colors.textPrimary} />
          </Pressable>
          <Pressable
            accessibilityLabel="알림 열기"
            accessibilityRole="button"
            onPress={openNotifications}
            style={styles.iconButton}
          >
            <Feather name="mail" size={fontSizes.metric} color={colors.textPrimary} />
            {unreadCount > 0 ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  iconButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    height: spacing.s20 * 2,
    justifyContent: 'center',
    position: 'relative',
    width: spacing.s20 * 2,
  },
  unreadBadge: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    minWidth: fontSizes.title,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    position: 'absolute',
    right: -spacing.xxs,
    top: -spacing.sm,
  },
  unreadBadgeText: {
    color: colors.white,
    fontSize: fontSizes.xxs,
    fontWeight: fontWeights.black,
  },
});
