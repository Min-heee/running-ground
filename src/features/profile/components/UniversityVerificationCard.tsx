import { type Href, Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import type { MyProfileResponse } from '@/lib/api/types';
import { colors, spacing, fontSizes, fontWeights } from '@/theme/tokens';

type UniversityVerificationCardProps = {
  profile: MyProfileResponse;
  href: Href;
};

export function UniversityVerificationCard({ profile, href }: UniversityVerificationCardProps) {
  return (
    <Link href={href} asChild>
      <Pressable>
        <Card style={styles.universityCard}>
          <View style={styles.sectionHeaderRow}>
            <SectionTitle>대학교 인증</SectionTitle>
            <Text style={styles.sectionLink}>관리</Text>
          </View>
          <Text style={styles.universityVerificationStatusValue}>
            {profile.universityName ? `${profile.universityName} 연결됨` : '아직 인증 전'}
          </Text>
          <Text style={styles.universityVerificationHint}>재학증명서 또는 에브리타임 방식</Text>
        </Card>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s12,
  },
  sectionLink: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  universityCard: {
    gap: spacing.lg,
  },
  universityVerificationStatusValue: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: fontWeights.extraBold,
  },
  universityVerificationHint: {
    color: colors.textSecondary,
    lineHeight: 18,
    fontSize: fontSizes.sm,
  },
});
