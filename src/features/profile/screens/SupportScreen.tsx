// 문의하기 (오너 2026-07-31) — 제목/내용만 보내고, 관리자가 웹 관리자에서 답변하면
// 이 화면의 내역에 답변이 붙고 인박스 알림(inquiry_reply)도 도착한다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Card } from '@/components/Card';
import { AuthHeader } from '@/components/ui/AuthHeader';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { createMyInquiry, fetchMyInquiries, getApiErrorMessage } from '@/services';
import type { MyInquiry } from '@/lib/api/types';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/theme/tokens';

const TITLE_MAX_LENGTH = 60;
const BODY_MAX_LENGTH = 1000;

function formatInquiryDate(value: string) {
  const at = new Date(value);

  if (Number.isNaN(at.getTime())) {
    return '';
  }

  // 기기 로컬(=한국) 달력으로 간단 표기.
  return `${at.getMonth() + 1}월 ${at.getDate()}일`;
}

export default function SupportScreen() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [inquiries, setInquiries] = useState<MyInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);

  // 느린 첫 로드가 제출 직후 갱신을 덮어써 방금 보낸 문의가 사라지는 걸 막는 세대 가드.
  const loadEpochRef = useRef(0);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadInquiries = useCallback(async () => {
    const epoch = loadEpochRef.current + 1;
    loadEpochRef.current = epoch;
    setLoading(true);

    try {
      const response = await fetchMyInquiries();

      if (loadEpochRef.current !== epoch) {
        return;
      }

      setInquiries(response.inquiries);
      setError(null);
    } catch (loadError) {
      if (loadEpochRef.current !== epoch) {
        return;
      }

      setError(getApiErrorMessage(loadError, '문의 내역을 불러오지 못했어요.'));
    } finally {
      if (loadEpochRef.current === epoch) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadInquiries();
  }, [loadInquiries]);

  useEffect(() => () => {
    if (successTimerRef.current) {
      clearTimeout(successTimerRef.current);
    }
  }, []);

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();

    if (!trimmedTitle || !trimmedBody) {
      setError('제목과 내용을 모두 입력해주세요.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSentMessage(null);

    try {
      await createMyInquiry({ title: trimmedTitle, body: trimmedBody });
      setTitle('');
      setBody('');
      setSentMessage('문의를 보냈어요. 답변이 오면 알림으로 알려드릴게요.');

      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }

      successTimerRef.current = setTimeout(() => setSentMessage(null), 4000);
      await loadInquiries();
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, '문의를 보내지 못했어요.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <AuthHeader
        title="문의하기"
        subtitle="궁금한 점이나 불편한 점을 보내주시면 확인 후 답변드려요."
        showBack
        backHref="/(tabs)/mypage"
      />

      <Card style={styles.formCard}>
        <Text style={styles.fieldLabel}>제목</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="예: 기록이 안 올라와요"
          placeholderTextColor={colors.textPlaceholder}
          maxLength={TITLE_MAX_LENGTH}
          editable={!submitting}
          style={styles.input}
        />

        <Text style={styles.fieldLabel}>내용</Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="어떤 상황이었는지 자세히 적어주시면 빠르게 확인할 수 있어요."
          placeholderTextColor={colors.textPlaceholder}
          maxLength={BODY_MAX_LENGTH}
          multiline
          editable={!submitting}
          style={[styles.input, styles.bodyInput]}
        />
        <Text style={styles.counterText}>{body.length}/{BODY_MAX_LENGTH}자</Text>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {sentMessage ? <Text style={styles.successText}>{sentMessage}</Text> : null}

        <PrimaryButton
          label={submitting ? '보내는 중...' : '문의 보내기'}
          onPress={() => {
            void handleSubmit();
          }}
          disabled={submitting}
        />
      </Card>

      <Card style={styles.historyCard}>
        <Text style={styles.sectionTitle}>내 문의 내역</Text>
        {loading ? <ActivityIndicator color={colors.brand} /> : null}

        {!loading && inquiries.length === 0 ? (
          <Text style={styles.emptyText}>아직 보낸 문의가 없어요.</Text>
        ) : null}

        {inquiries.map((inquiry) => (
          <View key={inquiry.id} style={styles.inquiryItem}>
            <View style={styles.inquiryHeader}>
              <Text style={styles.inquiryTitle} numberOfLines={1}>{inquiry.title}</Text>
              <Text style={inquiry.status === 'answered' ? styles.statusAnswered : styles.statusPending}>
                {inquiry.status === 'answered' ? '답변 완료' : '답변 대기'}
              </Text>
            </View>
            <Text style={styles.inquiryDate}>{formatInquiryDate(inquiry.createdAt)}</Text>
            <Text style={styles.inquiryBody}>{inquiry.body}</Text>

            {inquiry.replies.map((reply) => (
              <View key={reply.id} style={styles.replyBlock}>
                <Text style={styles.replyLabel}>답변 · {formatInquiryDate(reply.createdAt)}</Text>
                <Text style={styles.replyBody}>{reply.body}</Text>
              </View>
            ))}
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  formCard: {
    gap: spacing.s10,
  },
  historyCard: {
    gap: spacing.s12,
  },
  fieldLabel: {
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s12,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  bodyInput: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  counterText: {
    color: colors.textTertiary,
    fontSize: fontSizes.sm,
    textAlign: 'right',
  },
  errorText: {
    color: colors.danger,
    fontWeight: fontWeights.bold,
  },
  successText: {
    color: colors.successStrong,
    fontWeight: fontWeights.bold,
  },
  sectionTitle: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    color: colors.textPrimary,
  },
  emptyText: {
    color: colors.textSecondary,
  },
  inquiryItem: {
    gap: spacing.xs,
    paddingTop: spacing.s12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
  },
  inquiryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s10,
  },
  inquiryTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontWeight: fontWeights.extraBold,
  },
  statusPending: {
    color: colors.textTertiary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  statusAnswered: {
    color: colors.brand,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  inquiryDate: {
    color: colors.textTertiary,
    fontSize: fontSizes.sm,
  },
  inquiryBody: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  replyBlock: {
    marginTop: spacing.xxl,
    padding: spacing.s12,
    borderRadius: radii.lg,
    backgroundColor: colors.brandWash,
    gap: spacing.xxs,
  },
  replyLabel: {
    color: colors.brandStrong,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  replyBody: {
    color: colors.textPrimary,
    lineHeight: 20,
  },
});
