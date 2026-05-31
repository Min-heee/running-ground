import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import type { ConnectedSource, RunSourceType } from '@/domain';
import { SourceMethodGuideModal } from '@/features/integrations/components/SourceMethodGuideModal';
import { buildExclusiveSourceSelectorModel } from '@/features/integrations/exclusiveSourceSelectorModel';
import { getSourceMethodGuide } from '@/features/integrations/sourceMethodGuide';
import {
  getSourceMetadata,
  type DevicePlatform,
} from '@/features/integrations/sourceCatalog';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type ExclusiveSourceSelectorCardProps = {
  sources: ConnectedSource[];
  platform: DevicePlatform;
  actionSourceType: string | null;
  onConnectSource: (sourceType: RunSourceType) => Promise<void> | void;
  onDisconnectSource: (sourceType: RunSourceType) => Promise<void> | void;
};

type ExclusiveSourceRowProps = {
  actionSourceType: string | null;
  platform: DevicePlatform;
  selected: boolean;
  source: ConnectedSource;
  onConnectSource: (sourceType: RunSourceType) => Promise<void> | void;
  onShowMethod: (sourceType: RunSourceType) => void;
};

const ExclusiveSourceRow = memo(function ExclusiveSourceRow({
  actionSourceType,
  onConnectSource,
  onShowMethod,
  platform,
  selected,
  source,
}: ExclusiveSourceRowProps) {
  const metadata = useMemo(() => getSourceMetadata(source.sourceType, platform), [platform, source.sourceType]);
  const isBusy = actionSourceType === source.sourceType;
  const handlePress = useCallback(() => {
    if (selected) {
      return;
    }

    void onConnectSource(source.sourceType);
  }, [onConnectSource, selected, source.sourceType]);
  const handleShowMethod = useCallback(() => {
    onShowMethod(source.sourceType);
  }, [onShowMethod, source.sourceType]);

  return (
    <View
      style={[
        styles.optionRow,
        selected ? styles.optionRowSelected : null,
        isBusy ? styles.optionRowDisabled : null,
      ]}
    >
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        disabled={selected || isBusy}
        onPress={handlePress}
        style={styles.optionSelectArea}
      >
        <Text style={[styles.radioMark, selected ? styles.radioMarkSelected : null]}>
          {selected ? '◉' : '○'}
        </Text>
        <View style={styles.optionCopy}>
          <View style={styles.optionHeader}>
            <Text style={styles.optionName}>{source.displayName}</Text>
            {isBusy ? <Text style={styles.busyText}>{selected ? '처리 중...' : '연결 중...'}</Text> : null}
          </View>
          <Text style={styles.optionDescription}>{metadata.shortDescription}</Text>
          {selected ? (
            <View style={styles.selectedMetaBlock}>
              <Text style={styles.selectedMetaText}>마지막 동기화 {source.lastSyncedAt ?? '아직 없음'}</Text>
              {source.pendingImportCount ? (
                <Text style={styles.pendingText}>대기 중인 가져오기 {source.pendingImportCount}개</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={handleShowMethod}
        style={styles.methodButton}
      >
        <Text style={styles.methodButtonText}>연동 방법</Text>
      </Pressable>
    </View>
  );
});

type NoSourceRowProps = {
  actionSourceType: string | null;
  selectedSourceType: RunSourceType | null;
  onDisconnectSource: (sourceType: RunSourceType) => Promise<void> | void;
};

const NoSourceRow = memo(function NoSourceRow({
  actionSourceType,
  onDisconnectSource,
  selectedSourceType,
}: NoSourceRowProps) {
  const selected = selectedSourceType === null;
  const isBusy = selectedSourceType !== null && actionSourceType === selectedSourceType;
  const handlePress = useCallback(() => {
    if (!selectedSourceType) {
      return;
    }

    void onDisconnectSource(selectedSourceType);
  }, [onDisconnectSource, selectedSourceType]);

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      disabled={selected || isBusy}
      onPress={handlePress}
      style={[
        styles.optionRow,
        selected ? styles.optionRowSelected : null,
        isBusy ? styles.optionRowDisabled : null,
      ]}
    >
      <Text style={[styles.radioMark, selected ? styles.radioMarkSelected : null]}>
        {selected ? '◉' : '○'}
      </Text>
      <View style={styles.optionCopy}>
        <View style={styles.optionHeader}>
          <Text style={styles.optionName}>연동 안 함</Text>
          {isBusy ? <Text style={styles.busyText}>해제 중...</Text> : null}
        </View>
        <Text style={styles.optionDescription}>자동 기록 소스를 쓰지 않고, 앱 측정이나 수동 기록만 사용할게요.</Text>
      </View>
    </Pressable>
  );
});

export function ExclusiveSourceSelectorCard({
  actionSourceType,
  onConnectSource,
  onDisconnectSource,
  platform,
  sources,
}: ExclusiveSourceSelectorCardProps) {
  const [methodSourceType, setMethodSourceType] = useState<RunSourceType | null>(null);
  const model = useMemo(() => buildExclusiveSourceSelectorModel(sources, platform), [platform, sources]);
  const methodGuide = useMemo(() => (
    methodSourceType ? getSourceMethodGuide(methodSourceType, platform) : null
  ), [methodSourceType, platform]);
  const handleCloseMethod = useCallback(() => {
    setMethodSourceType(null);
  }, []);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.sectionTitle}>자동 기록 소스</Text>
        <Text style={styles.helperText}>
          한 번에 1개만 연결돼요. 다른 소스를 고르면 이전 소스는 자동으로 해제돼서, 같은 러닝이 중복으로 쌓이지 않아요.
        </Text>
      </View>
      <View accessibilityRole="radiogroup" style={styles.optionList}>
        {model.rows.map((row) => (
          <ExclusiveSourceRow
            key={row.source.sourceType}
            actionSourceType={actionSourceType}
            onConnectSource={onConnectSource}
            onShowMethod={setMethodSourceType}
            platform={platform}
            selected={row.selected}
            source={row.source}
          />
        ))}
        <NoSourceRow
          actionSourceType={actionSourceType}
          onDisconnectSource={onDisconnectSource}
          selectedSourceType={model.selectedSourceType}
        />
      </View>
      <SourceMethodGuideModal
        guide={methodGuide}
        onClose={handleCloseMethod}
        visible={methodSourceType !== null}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.s16,
  },
  header: {
    gap: spacing.xxl,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
  },
  helperText: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  optionList: {
    gap: spacing.s10,
  },
  optionRow: {
    alignItems: 'flex-start',
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.borderSoft,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.s12,
    paddingHorizontal: spacing.s14,
    paddingVertical: spacing.s14,
  },
  optionSelectArea: {
    alignItems: 'flex-start',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.s12,
  },
  optionRowSelected: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brand,
  },
  optionRowDisabled: {
    opacity: 0.72,
  },
  radioMark: {
    color: colors.textTertiary,
    fontSize: fontSizes.large,
    fontWeight: fontWeights.extraBold,
    lineHeight: 22,
  },
  radioMarkSelected: {
    color: colors.brand,
  },
  optionCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  optionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.s10,
    justifyContent: 'space-between',
  },
  optionName: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  busyText: {
    color: colors.brand,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
  },
  optionDescription: {
    color: colors.textSecondary,
    lineHeight: 19,
  },
  selectedMetaBlock: {
    gap: spacing.xxs,
    marginTop: spacing.xs,
  },
  selectedMetaText: {
    color: colors.brand,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    lineHeight: 18,
  },
  pendingText: {
    color: colors.orangeText,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    lineHeight: 18,
  },
  methodButton: {
    borderColor: colors.brandSoftBorder,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.lg,
  },
  methodButtonText: {
    color: colors.brand,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
  },
});
