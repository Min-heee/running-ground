import { useCallback, useState } from 'react';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fetchInbox } from '@/services';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

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

  return (
    <View style={styles.headerRow}>
      <View style={styles.headerCopy}>
        <Text style={styles.headerLabel}>홈</Text>
        <Text style={styles.headerBrand}>RunningGround</Text>
      </View>
      <View style={styles.headerActions}>
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
  },
  headerCopy: {
    gap: spacing.sm,
  },
  headerLabel: {
    color: colors.textHeading,
    fontSize: fontSizes.pageTitle,
    fontWeight: fontWeights.extraBold,
  },
  headerBrand: {
    color: colors.brand,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.extraBold,
    letterSpacing: 0.4,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
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
