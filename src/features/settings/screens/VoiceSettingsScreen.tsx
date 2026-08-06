import { useCallback, useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthHeader } from '@/components/ui/AuthHeader';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import {
  AUTO_VOICE_ID,
  getPreferredVoiceIdentifier,
  listKoreanVoiceOptions,
  previewVoice,
  setPreferredVoiceIdentifier,
  type KoreanVoiceOption,
} from '@/lib/speechVoicePreference';
import { colors, fixedColors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

// 음성 안내 목소리 선택 (오너 2026-08-06): 페이스메이커 · VS ME · 대결 안내 · 친구
// 응원이 전부 같은 목소리를 쓴다. 행을 탭하면 즉시 저장 + 그 목소리로 미리듣기.

export default function VoiceSettingsScreen() {
  const [voiceOptions, setVoiceOptions] = useState<KoreanVoiceOption[]>([]);
  const [selectedId, setSelectedId] = useState<string>(AUTO_VOICE_ID);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listKoreanVoiceOptions(), getPreferredVoiceIdentifier()])
      .then(([options, preferred]) => {
        if (cancelled) {
          return;
        }
        setVoiceOptions(options);
        setSelectedId(preferred ?? AUTO_VOICE_ID);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelect = useCallback((identifier: string) => {
    setSelectedId(identifier);
    void setPreferredVoiceIdentifier(identifier === AUTO_VOICE_ID ? null : identifier);
    // 자동 추천을 고르면 시스템이 뽑을 목소리 그대로 들려준다.
    void previewVoice(identifier === AUTO_VOICE_ID ? null : identifier);
  }, []);

  return (
    <Screen>
      <AuthHeader
        title="음성 안내 목소리"
        subtitle="페이스메이커, 자신과의 대결, 대결 안내와 친구 응원에서 들려요. 눌러서 들어보고 골라주세요."
        showBack
        backHref="/(tabs)/mypage"
      />

      <Card style={styles.listCard}>
        <VoiceRow
          label="자동 추천"
          description="기기에서 가장 자연스러운 한국어 음성을 자동으로 골라요"
          selected={selectedId === AUTO_VOICE_ID}
          onPress={() => handleSelect(AUTO_VOICE_ID)}
        />
        {voiceOptions.map((option) => (
          <VoiceRow
            key={option.identifier}
            label={option.label}
            description={option.isEnhanced ? '고품질' : undefined}
            selected={selectedId === option.identifier}
            onPress={() => handleSelect(option.identifier)}
          />
        ))}
        {loaded && voiceOptions.length === 0 ? (
          <Text style={styles.emptyText}>
            이 기기에서 고를 수 있는 한국어 음성을 찾지 못했어요. 자동 추천으로 안내해 드릴게요.
          </Text>
        ) : null}
      </Card>

      <Text style={styles.footnote}>
        iPhone은 설정 → 손쉬운 사용 → 콘텐츠 말하기 → 음성에서, Android는 설정 → 일반 → TTS 출력에서
        새 음성을 내려받으면 목록에 추가돼요.
      </Text>
    </Screen>
  );
}

function VoiceRow({
  label,
  description,
  selected,
  onPress,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.voiceRow, selected ? styles.voiceRowSelected : null]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label} 목소리 들어보고 선택`}
    >
      <View style={styles.voiceCopy}>
        <Text style={[styles.voiceLabel, selected ? styles.voiceLabelSelected : null]}>{label}</Text>
        {description ? <Text style={styles.voiceDescription}>{description}</Text> : null}
      </View>
      <Feather
        name={selected ? 'check-circle' : 'volume-2'}
        size={20}
        color={selected ? fixedColors.brand : colors.textTertiary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  listCard: {
    gap: spacing.sm,
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s12,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s12,
  },
  voiceRowSelected: {
    backgroundColor: colors.surface,
    borderColor: fixedColors.brand,
  },
  voiceCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  voiceLabel: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  voiceLabelSelected: {
    fontWeight: fontWeights.extraBold,
  },
  voiceDescription: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 20,
  },
  footnote: {
    color: colors.textTertiary,
    fontSize: fontSizes.xs,
    lineHeight: 18,
  },
});
