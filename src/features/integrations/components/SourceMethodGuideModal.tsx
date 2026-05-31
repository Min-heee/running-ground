import { memo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { SourceMethodGuide } from '@/features/integrations/sourceMethodGuide';
import { colors, spacing, fontSizes, fontWeights, radii } from '@/theme/tokens';

type SourceMethodGuideModalProps = {
  visible: boolean;
  guide: SourceMethodGuide | null;
  onClose: () => void;
};

export const SourceMethodGuideModal = memo(function SourceMethodGuideModal({
  guide,
  onClose,
  visible,
}: SourceMethodGuideModalProps) {
  if (!guide) {
    return null;
  }

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View
        accessibilityViewIsModal
        style={styles.overlay}
      >
        <Pressable
          accessibilityLabel="설명 닫기"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.backdrop}
        />
        <View style={styles.modalCard}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>연동 방법</Text>
              <Text accessibilityRole="header" style={styles.title}>{guide.title}</Text>
            </View>
            <Pressable
              accessibilityLabel="닫기"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.closeButton}
            >
              <Text style={styles.closeButtonText}>X</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.stepList}
            showsVerticalScrollIndicator={false}
          >
            {guide.steps.map((step, index) => (
              <View key={`${step.title}-${index}`} style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <View style={styles.stepCopy}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepDescription}>{step.description}</Text>
                </View>
              </View>
            ))}
            {guide.footnote ? <Text style={styles.footnote}>{guide.footnote}</Text> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.s20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(11, 18, 32, 0.62)',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.cardLarge,
    gap: spacing.s16,
    maxHeight: '78%',
    padding: spacing.s18,
    width: '100%',
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.s14,
    justifyContent: 'space-between',
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  eyebrow: {
    color: colors.brand,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.extraBold,
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.extraBold,
    lineHeight: 24,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceSoft,
    borderRadius: radii.pill,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  closeButtonText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  stepList: {
    gap: spacing.s14,
    paddingBottom: spacing.xs,
  },
  stepRow: {
    flexDirection: 'row',
    gap: spacing.s12,
  },
  stepNumber: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  stepNumberText: {
    color: colors.white,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.extraBold,
  },
  stepCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  stepTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.extraBold,
  },
  stepDescription: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  footnote: {
    backgroundColor: colors.brandSoft,
    borderRadius: radii.md,
    color: colors.textSecondary,
    lineHeight: 20,
    padding: spacing.s12,
  },
});
