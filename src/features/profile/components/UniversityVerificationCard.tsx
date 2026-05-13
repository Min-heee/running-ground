import { type Href, Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { SectionTitle } from '@/components/SectionTitle';
import type { MyProfileResponse } from '@/lib/api/types';

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
    gap: 12,
  },
  sectionLink: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
  },
  universityCard: {
    gap: 6,
  },
  universityVerificationStatusValue: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '800',
  },
  universityVerificationHint: {
    color: '#667085',
    lineHeight: 18,
    fontSize: 12,
  },
});
