import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/stores/projectStore';
import { useTheme, useStyles, type Theme } from '@/theme';

const PROJECT_COLORS = [
  '#6366F1', '#EF4444', '#F59E0B', '#10B981', '#3B82F6',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6B7280',
];

export default function NewProjectScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { createProject } = useProjectStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedColor, setSelectedColor] = useState(PROJECT_COLORS[0]);
  const [budget, setBudget] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert(t('common.error'), t('projects.projectName'));
      return;
    }

    setIsSubmitting(true);
    try {
      await createProject({
        name: name.trim(),
        description: description.trim() || undefined,
        color: selectedColor,
        budget: budget ? parseFloat(budget) : undefined,
      });
      router.back();
    } catch {
      Alert.alert(t('common.error'), t('common.retry'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior="padding"
        style={styles.flex}
      >
        <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent}>
          {/* Name */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>{t('projects.projectName')}</Text>
            <TextInput
              style={styles.textInput}
              value={name}
              onChangeText={setName}
              placeholder={t('projects.projectName')}
              placeholderTextColor={theme.colors.textTertiary}
              autoFocus
              maxLength={100}
            />
          </View>

          {/* Description */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>{t('projects.description')}</Text>
            <TextInput
              style={[styles.textInput, { minHeight: 80, textAlignVertical: 'top' }]}
              value={description}
              onChangeText={setDescription}
              placeholder={t('projects.description')}
              placeholderTextColor={theme.colors.textTertiary}
              multiline
              maxLength={500}
            />
          </View>

          {/* Color */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>{t('projects.color')}</Text>
            <View style={styles.colorRow}>
              {PROJECT_COLORS.map(color => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorCircle,
                    { backgroundColor: color },
                    selectedColor === color && styles.colorSelected,
                  ]}
                  onPress={() => setSelectedColor(color)}
                >
                  {selectedColor === color && (
                    <Ionicons name="checkmark" size={18} color={theme.colors.textInverse} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Budget */}
          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>
              {t('projects.budget')}
            </Text>
            <TextInput
              style={styles.textInput}
              value={budget}
              onChangeText={setBudget}
              placeholder="0.00"
              placeholderTextColor={theme.colors.textTertiary}
              keyboardType="decimal-pad"
            />
          </View>
        </ScrollView>

        {/* Submit */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleCreate}
            disabled={isSubmitting || !name.trim()}
          >
            <Ionicons name="checkmark" size={22} color={theme.colors.textInverse} />
            <Text style={styles.submitButtonText}>
              {isSubmitting ? t('common.loading') : t('projects.createProject')}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing[6],
  },
  fieldContainer: {
    marginBottom: theme.spacing[6],
  },
  fieldLabel: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  textInput: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  colorRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[3],
  },
  colorCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  colorSelected: {
    borderWidth: 3,
    borderColor: theme.colors.surface,
    ...theme.shadows.md,
  },
  footer: {
    padding: theme.spacing[4],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[4],
    borderRadius: theme.borderRadius.lg,
    gap: theme.spacing[2],
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    ...theme.textStyles.h3,
    color: theme.colors.textInverse,
  },
});
