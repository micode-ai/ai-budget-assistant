import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  Image,
  Modal,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system/next';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useExpenseStore } from '@/stores/expenseStore';
import { useTagStore } from '@/stores/tagStore';
import { useProjectStore } from '@/stores/projectStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { getTagsForExpense } from '@/db/tagRepository';
import { getSplitsForExpense, insertSplit, deleteAllSplitsForExpense } from '@/db/splitRepository';
import { api } from '@/services/api';
import { TagChip } from '@/components/TagChip';
import { getCategoryDisplayName } from '@/utils/categoryDisplayName';
import { SplitEditor } from '@/components/SplitEditor';
import { formatCurrency, formatDate, generateUUID } from '@budget/shared-utils';
import { getIntlLocale } from '@/i18n';
import type { ExpenseItem, ExpenseCategorySplit, Tag } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';

export default function ExpenseDetailScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
  const {
    expenses,
    updateExpense,
    deleteExpense,
    expenseItems,
    loadExpenseItems,
    addExpenseItem,
    updateExpenseItem,
    deleteExpenseItem,
    loadReceiptImage,
    saveReceiptImage,
    deleteReceiptImage,
  } = useExpenseStore();
  useTagStore();
  const { projects } = useProjectStore();
  const { getExpenseCategories, getCategoryById, loadCategories, isInitialized: categoriesInitialized } = useCategoryStore();
  const expense = expenses.find((e) => e.id === id);

  // Tags loaded from DB join table
  const [expenseTags, setExpenseTags] = useState<Tag[]>([]);
  // Splits loaded from DB
  const [splits, setSplits] = useState<ExpenseCategorySplit[]>([]);
  const [showSplitEditor, setShowSplitEditor] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  useEffect(() => {
    if (edit === 'true') setIsEditing(true);
  }, [edit]);
  const [editDescription, setEditDescription] = useState(expense?.description || '');
  const [editAmount, setEditAmount] = useState(expense?.amount?.toString() || '');
  const [editCategory, setEditCategory] = useState(expense?.categoryId || '');
  const [editDate, setEditDate] = useState(expense?.date ? new Date(expense.date) : new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Items state
  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<ExpenseItem | null>(null);
  const [itemDescription, setItemDescription] = useState('');
  const [itemQuantity, setItemQuantity] = useState('1');
  const [itemUnitPrice, setItemUnitPrice] = useState('0');
  const [itemTotalPrice, setItemTotalPrice] = useState('0');

  // Receipt image state
  const [receiptImageBase64, setReceiptImageBase64] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageViewVisible, setImageViewVisible] = useState(false);

  const items = id ? expenseItems[id] || [] : [];

  useEffect(() => {
    if (!categoriesInitialized) loadCategories();
    if (id && expense?.source === 'ocr') {
      loadExpenseItems(id);
    }
    // Load tags from expense_tags join table
    if (id) {
      getTagsForExpense(id).then(setExpenseTags).catch(() => {});
      getSplitsForExpense(id).then(setSplits).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleLoadReceiptImage = useCallback(async () => {
    if (!id) return;
    setImageLoading(true);
    const base64 = await loadReceiptImage(id);
    setReceiptImageBase64(base64);
    setImageLoading(false);
  }, [id, loadReceiptImage]);

  useEffect(() => {
    if (id) {
      handleLoadReceiptImage();
    }
  }, [id, handleLoadReceiptImage]);

  // Item modal helpers
  const openAddItem = () => {
    setEditingItem(null);
    setItemDescription('');
    setItemQuantity('1');
    setItemUnitPrice('0');
    setItemTotalPrice('0');
    setItemModalVisible(true);
  };

  const openEditItem = (item: ExpenseItem) => {
    setEditingItem(item);
    setItemDescription(item.description);
    setItemQuantity(item.quantity.toString());
    setItemUnitPrice(item.unitPrice.toString());
    setItemTotalPrice(item.totalPrice.toString());
    setItemModalVisible(true);
  };

  const handleSaveItem = () => {
    if (!id) return;
    const total = parseFloat(itemTotalPrice);
    if (!itemDescription.trim() || isNaN(total) || total <= 0) {
      Alert.alert(t('common.error'), t('validation.invalidAmount'));
      return;
    }

    if (editingItem) {
      updateExpenseItem(id, editingItem.id, {
        description: itemDescription.trim(),
        quantity: parseFloat(itemQuantity) || 1,
        unitPrice: parseFloat(itemUnitPrice) || 0,
        totalPrice: total,
      });
    } else {
      addExpenseItem(id, {
        description: itemDescription.trim(),
        quantity: parseFloat(itemQuantity) || 1,
        unitPrice: parseFloat(itemUnitPrice) || 0,
        totalPrice: total,
        sortOrder: items.length,
      });
    }
    setItemModalVisible(false);
  };

  const handleDeleteItem = (item: ExpenseItem) => {
    if (!id) return;
    Alert.alert(t('expenseDetail.confirmDeleteItem'), '', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => deleteExpenseItem(id, item.id),
      },
    ]);
  };

  // Receipt image helpers
  const handleShareImage = async () => {
    if (!receiptImageBase64) return;
    const file = new File(Paths.cache, `receipt-${id}.jpg`);
    file.write(receiptImageBase64, { encoding: 'base64' });
    await Sharing.shareAsync(file.uri, { mimeType: 'image/jpeg' });
  };

  const handleSaveImage = async () => {
    if (!receiptImageBase64) return;
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('common.error'), t('expenseDetail.galleryPermissionDenied'));
      return;
    }
    const file = new File(Paths.cache, `receipt-${id}.jpg`);
    file.write(receiptImageBase64, { encoding: 'base64' });
    await MediaLibrary.saveToLibraryAsync(file.uri);
    Alert.alert('', t('expenseDetail.imageSaved'));
  };

  const handleReplaceImage = async () => {
    if (!id) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled) return;

    const compressed = await ImageManipulator.manipulateAsync(
      result.assets[0].uri,
      [{ resize: { width: 800 } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG },
    );
    const compressedFile = new File(compressed.uri);
    const base64 = await compressedFile.base64();
    await saveReceiptImage(id, base64);
    setReceiptImageBase64(base64);
  };

  const handleDeleteImage = () => {
    if (!id) return;
    Alert.alert(t('expenseDetail.confirmDeleteImage'), '', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteReceiptImage(id);
          setReceiptImageBase64(null);
        },
      },
    ]);
  };

  if (!expense) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={64} color={theme.colors.textDisabled} />
          <Text style={styles.notFoundText}>{t('expenseDetail.notFound')}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>{t('common.back')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleCopy = () => {
    router.push({
      pathname: '/expense/new',
      params: {
        amount: expense.amount.toString(),
        description: expense.description || '',
        categoryId: expense.categoryId || '',
        currencyCode: expense.currencyCode,
      },
    });
  };

  const handleDelete = () => {
    Alert.alert(t('expenseDetail.deleteTitle'), t('expenseDetail.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          deleteExpense(expense.id);
          router.back();
        },
      },
    ]);
  };

  const handleSaveEdit = () => {
    const numericAmount = parseFloat(editAmount);
    if (!numericAmount || numericAmount <= 0) {
      Alert.alert(t('common.error'), t('validation.invalidAmount'));
      return;
    }

    updateExpense(expense.id, {
      amount: numericAmount,
      description: editDescription.trim(),
      categoryId: editCategory || undefined,
      date: editDate,
    });
    setIsEditing(false);
  };

  const handleSaveSplits = async (editorSplits: { categoryId: string; categoryName: string; amount: number; percentage: number; notes?: string }[]) => {
    if (!id) return;
    // Remove old splits
    await deleteAllSplitsForExpense(id);
    // Insert new splits
    const now = new Date();
    const newSplits: ExpenseCategorySplit[] = [];
    for (const s of editorSplits) {
      const split: ExpenseCategorySplit = {
        id: generateUUID(),
        expenseId: id,
        categoryId: s.categoryId,
        amount: s.amount,
        percentage: s.percentage,
        notes: s.notes,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
        syncVersion: 0,
      };
      await insertSplit(split);
      newSplits.push(split);
    }
    setSplits(newSplits);
    setShowSplitEditor(false);

    // Fire-and-forget sync to server
    api.setExpenseSplits(id, editorSplits.map(s => ({
      categoryId: s.categoryId,
      amount: s.amount,
      percentage: s.percentage,
      notes: s.notes,
    }))).catch(e => console.error('Failed to sync splits to server:', e));
  };

  const handleRemoveSplits = async () => {
    if (!id) return;
    Alert.alert(t('splits.removeSplit'), '', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteAllSplitsForExpense(id);
          setSplits([]);
          // Fire-and-forget sync to server
          api.removeExpenseSplits(id).catch(e => console.error('Failed to remove splits on server:', e));
        },
      },
    ]);
  };

  const sourceLabel: Record<string, string> = {
    manual: t('expenseDetail.sourceManual'),
    voice: t('expenseDetail.sourceVoice'),
    ocr: t('expenseDetail.sourceOcr'),
    import: t('expenseDetail.sourceImport'),
  };

  const sourceIcon: Record<string, string> = {
    manual: 'create-outline',
    voice: 'mic-outline',
    ocr: 'camera-outline',
    import: 'download-outline',
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Amount Card */}
        <View style={styles.amountCard}>
          {isEditing ? (
            <TextInput
              style={styles.amountEditInput}
              value={editAmount}
              onChangeText={setEditAmount}
              keyboardType="decimal-pad"
              autoFocus
            />
          ) : (
            <Text style={styles.amountText}>
              {formatCurrency(expense.amount, expense.currencyCode)}
            </Text>
          )}
          {expense.discountAmount != null && expense.discountAmount > 0 && (
            <Text style={styles.discountText}>
              {t('receipt.discount')}: -{formatCurrency(expense.discountAmount, expense.currencyCode)}
            </Text>
          )}
          <View style={styles.sourceBadge}>
            <Ionicons
              name={(sourceIcon[expense.source] || 'help-circle-outline') as any}
              size={14}
              color={theme.colors.textSecondary}
            />
            <Text style={styles.sourceText}>{sourceLabel[expense.source] || expense.source}</Text>
          </View>
        </View>

        {/* Debt Repayment Banner */}
        {expense.isDebtRepayment && (
          <View style={styles.debtRepaymentBanner}>
            <Ionicons name="return-down-back" size={16} color={theme.colors.warning} />
            <Text style={styles.debtRepaymentText}>{t('debt.isDebtRepayment')}</Text>
          </View>
        )}

        {/* Details */}
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('expenseDetail.description')}</Text>
            {isEditing ? (
              <TextInput
                style={styles.detailEditInput}
                value={editDescription}
                onChangeText={setEditDescription}
              />
            ) : (
              <Text style={styles.detailValue}>{expense.description || t('expenseDetail.noDescription')}</Text>
            )}
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('expenseDetail.date')}</Text>
            {isEditing ? (
              <>
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Ionicons name="calendar-outline" size={18} color={theme.colors.primary} />
                  <Text style={styles.datePickerText}>{formatDate(editDate, undefined, getIntlLocale())}</Text>
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    value={editDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_event: any, selectedDate?: Date) => {
                      setShowDatePicker(Platform.OS === 'ios');
                      if (selectedDate) setEditDate(selectedDate);
                    }}
                  />
                )}
              </>
            ) : (
              <Text style={styles.detailValue}>{formatDate(expense.date, undefined, getIntlLocale())}</Text>
            )}
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('expenseDetail.category')}</Text>
            {isEditing ? (
              <View style={styles.categoryGrid}>
                {getExpenseCategories().map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.categoryChip,
                      editCategory === cat.id && {
                        backgroundColor: cat.color,
                        borderColor: cat.color,
                      },
                    ]}
                    onPress={() =>
                      setEditCategory(editCategory === cat.id ? '' : cat.id)
                    }
                  >
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={[
                        styles.categoryChipText,
                        editCategory === cat.id && styles.categoryChipTextSelected,
                      ]}
                    >
                      {getCategoryDisplayName(cat, t)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={styles.detailValue}>
                {(expense.categoryId && (() => { const c = getCategoryById(expense.categoryId); return c ? getCategoryDisplayName(c, t) : null; })()) || t('common.uncategorized')}
              </Text>
            )}
          </View>

          {expense.notes && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t('expenseDetail.notes')}</Text>
              <Text style={styles.detailValue}>{expense.notes}</Text>
            </View>
          )}

          {/* Tags Section */}
          {expenseTags.length > 0 && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t('tags.title')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {expenseTags.map((tag) => (
                  <TagChip key={tag.id} name={tag.name} color={tag.color} size="small" />
                ))}
              </View>
            </View>
          )}

          {/* Project Section */}
          {expense.projectId && (() => {
            const project = projects.find(p => p.id === expense.projectId);
            return project ? (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{t('projects.title')}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: project.color || '#6366F1' }} />
                  <Text style={styles.detailValue}>{project.name}</Text>
                </View>
              </View>
            ) : null;
          })()}

          {/* Category Splits Section */}
          {splits.length > 0 && !showSplitEditor && (
            <View style={styles.detailRow}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.detailLabel}>{t('splits.title')}</Text>
                <TouchableOpacity onPress={handleRemoveSplits}>
                  <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
                </TouchableOpacity>
              </View>
              {splits.map((split) => {
                const cat = getCategoryById(split.categoryId);
                return (
                  <View key={split.id} style={styles.splitRow}>
                    <View style={[styles.splitDot, { backgroundColor: cat?.color || '#6B7280' }]} />
                    <Text style={styles.splitName}>{cat ? getCategoryDisplayName(cat, t) : split.categoryId}</Text>
                    <Text style={styles.splitAmount}>
                      {formatCurrency(split.amount, expense.currencyCode)}
                    </Text>
                    <Text style={styles.splitPercent}>{split.percentage.toFixed(0)}%</Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Split Editor */}
          {showSplitEditor && expense && (
            <View style={styles.detailRow}>
              <SplitEditor
                totalAmount={expense.amount}
                currencyCode={expense.currencyCode}
                initialSplits={splits.map((s) => {
                  const cat = getCategoryById(s.categoryId);
                  return {
                    categoryId: s.categoryId,
                    categoryName: cat ? getCategoryDisplayName(cat, t) : s.categoryId,
                    amount: s.amount,
                    percentage: s.percentage,
                    notes: s.notes,
                  };
                })}
                onSplitsChange={handleSaveSplits}
                onCancel={() => setShowSplitEditor(false)}
              />
            </View>
          )}

          {/* Split by categories button */}
          {!isEditing && !showSplitEditor && splits.length === 0 && (
            <TouchableOpacity
              style={styles.splitButton}
              onPress={() => setShowSplitEditor(true)}
            >
              <Ionicons name="git-branch-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.splitButtonText}>{t('splits.splitExpense')}</Text>
            </TouchableOpacity>
          )}

          {/* Debt Info Section */}
          {expense.isDebt && (
            <View style={styles.debtSection}>
              <View style={styles.debtHeader}>
                <Ionicons name="people-outline" size={18} color={theme.colors.primary} />
                <Text style={styles.debtHeaderText}>{t('debt.lent')}</Text>
              </View>
              {expense.debtContactName && (
                <View style={styles.debtRow}>
                  <Text style={styles.debtRowLabel}>{t('debt.contact')}</Text>
                  <Text style={styles.debtRowValue}>{expense.debtContactName}</Text>
                </View>
              )}
              {expense.debtDueDate && (
                <View style={styles.debtRow}>
                  <Text style={styles.debtRowLabel}>{t('debt.dueDate')}</Text>
                  <Text style={styles.debtRowValue}>{new Date(expense.debtDueDate).toLocaleDateString()}</Text>
                </View>
              )}
              <TouchableOpacity
                style={styles.recordRepaymentButton}
                onPress={() => router.push({
                  pathname: '/income/new',
                  params: {
                    isDebtRepayment: 'true',
                    relatedDebtExpenseId: expense.id,
                    debtContactName: expense.debtContactName || '',
                    currencyCode: expense.currencyCode,
                  },
                })}
              >
                <Ionicons name="return-down-back" size={18} color={theme.colors.success} />
                <Text style={styles.recordRepaymentText}>{t('debt.recordRepayment')}</Text>
              </TouchableOpacity>
            </View>
          )}

        </View>

        {/* Receipt Items (for OCR expenses) */}
        {expense.source === 'ocr' && (
          <View style={styles.itemsCard}>
            <View style={styles.itemsHeader}>
              <Text style={styles.itemsTitle}>{t('expenseDetail.receiptItems')}</Text>
              <TouchableOpacity onPress={openAddItem} style={styles.addItemButton}>
                <Ionicons name="add-circle-outline" size={24} color={theme.colors.primary} />
              </TouchableOpacity>
            </View>

            {items.length === 0 ? (
              <Text style={styles.noItemsText}>{t('expenseDetail.noItems')}</Text>
            ) : (
              items.filter((i) => !i.isDeleted).map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName} numberOfLines={1}>{item.description}</Text>
                    <Text style={styles.itemMeta}>
                      {item.quantity} x {formatCurrency(item.unitPrice, expense.currencyCode)}
                    </Text>
                  </View>
                  <View style={styles.itemActions}>
                    <Text style={styles.itemTotal}>
                      {formatCurrency(item.totalPrice, expense.currencyCode)}
                    </Text>
                    <View style={styles.itemButtons}>
                      <TouchableOpacity onPress={() => openEditItem(item)} style={styles.itemIconBtn}>
                        <Ionicons name="pencil-outline" size={16} color={theme.colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteItem(item)} style={styles.itemIconBtn}>
                        <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Receipt Image */}
        {(receiptImageBase64 || expense.source === 'ocr') && (
          <View style={styles.imageCard}>
            <Text style={styles.imageSectionTitle}>{t('expenseDetail.receiptImage')}</Text>

            {imageLoading ? (
              <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginVertical: 16 }} />
            ) : receiptImageBase64 ? (
              <>
                <TouchableOpacity onPress={() => setImageViewVisible(true)}>
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${receiptImageBase64}` }}
                    style={styles.receiptThumbnail}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
                <View style={styles.imageActions}>
                  <TouchableOpacity style={styles.imageActionBtn} onPress={() => setImageViewVisible(true)}>
                    <Ionicons name="eye-outline" size={18} color={theme.colors.primary} />
                    <Text style={styles.imageActionText}>{t('expenseDetail.viewImage')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.imageActionBtn} onPress={handleShareImage}>
                    <Ionicons name="share-outline" size={18} color={theme.colors.primary} />
                    <Text style={styles.imageActionText}>{t('expenseDetail.shareImage')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.imageActionBtn} onPress={handleSaveImage}>
                    <Ionicons name="download-outline" size={18} color={theme.colors.primary} />
                    <Text style={styles.imageActionText}>{t('expenseDetail.saveImage')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.imageActionBtn} onPress={handleReplaceImage}>
                    <Ionicons name="swap-horizontal-outline" size={18} color={theme.colors.secondary} />
                    <Text style={[styles.imageActionText, { color: theme.colors.secondary }]}>{t('expenseDetail.replaceImage')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.imageActionBtn} onPress={handleDeleteImage}>
                    <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                    <Text style={[styles.imageActionText, { color: theme.colors.danger }]}>{t('expenseDetail.deleteImage')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <TouchableOpacity style={styles.addImageBtn} onPress={handleReplaceImage}>
                <Ionicons name="image-outline" size={32} color={theme.colors.textDisabled} />
                <Text style={styles.addImageText}>{t('expenseDetail.replaceImage')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Image Viewer Modal */}
        <Modal visible={imageViewVisible} transparent animationType="fade">
          <View style={styles.imageModalOverlay}>
            <TouchableOpacity style={styles.imageModalClose} onPress={() => setImageViewVisible(false)}>
              <Ionicons name="close-circle" size={36} color="#fff" />
            </TouchableOpacity>
            {receiptImageBase64 && (
              <Image
                source={{ uri: `data:image/jpeg;base64,${receiptImageBase64}` }}
                style={styles.imageModalFull}
                resizeMode="contain"
              />
            )}
          </View>
        </Modal>

        {/* Item Add/Edit Modal */}
        <Modal visible={itemModalVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                {editingItem ? t('expenseDetail.editItem') : t('expenseDetail.addItem')}
              </Text>

              <Text style={styles.modalLabel}>{t('expenseDetail.itemDescription')}</Text>
              <TextInput
                style={styles.modalInput}
                value={itemDescription}
                onChangeText={setItemDescription}
                placeholder={t('expenseDetail.itemDescription')}
              />

              <View style={styles.modalRow}>
                <View style={styles.modalHalf}>
                  <Text style={styles.modalLabel}>{t('expenseDetail.itemQuantity')}</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={itemQuantity}
                    onChangeText={setItemQuantity}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.modalHalf}>
                  <Text style={styles.modalLabel}>{t('expenseDetail.itemUnitPrice')}</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={itemUnitPrice}
                    onChangeText={setItemUnitPrice}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <Text style={styles.modalLabel}>{t('expenseDetail.itemTotalPrice')}</Text>
              <TextInput
                style={styles.modalInput}
                value={itemTotalPrice}
                onChangeText={setItemTotalPrice}
                keyboardType="decimal-pad"
              />

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancel} onPress={() => setItemModalVisible(false)}>
                  <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSave} onPress={handleSaveItem}>
                  <Text style={styles.modalSaveText}>{t('common.save')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          {isEditing ? (
            <View style={styles.editActions}>
              <TouchableOpacity
                style={styles.cancelEditButton}
                onPress={() => {
                  setIsEditing(false);
                  setEditDescription(expense.description || '');
                  setEditAmount(expense.amount.toString());
                  setEditCategory(expense.categoryId || '');
                  setEditDate(new Date(expense.date));
                  setShowDatePicker(false);
                }}
              >
                <Text style={styles.cancelEditText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveEditButton} onPress={handleSaveEdit}>
                <Ionicons name="checkmark" size={20} color={theme.colors.textInverse} />
                <Text style={styles.saveEditText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.editActions}>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => setIsEditing(true)}
              >
                <Ionicons name="pencil" size={22} color={theme.colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.copyButton} onPress={handleCopy}>
                <Ionicons name="copy-outline" size={22} color={theme.colors.secondary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                <Ionicons name="trash" size={22} color={theme.colors.danger} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: theme.spacing[6],
  },
  notFoundText: {
    fontSize: 18,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[4],
  },
  backButton: {
    marginTop: theme.spacing[4],
    paddingHorizontal: theme.spacing[6],
    paddingVertical: theme.spacing[3],
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
  },
  backButtonText: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: '600' as const,
  },
  scrollContent: {
    padding: theme.spacing[4],
  },
  amountCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[6],
    alignItems: 'center' as const,
    marginBottom: theme.spacing[4],
    ...theme.shadows.md,
  },
  amountText: {
    fontSize: 36,
    fontWeight: 'bold' as const,
    color: theme.colors.danger,
  },
  amountEditInput: {
    fontSize: 36,
    fontWeight: 'bold' as const,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.primary,
    paddingBottom: theme.spacing[1],
    minWidth: 150,
  },
  discountText: {
    fontSize: 16,
    color: theme.colors.success,
    fontWeight: '500' as const,
    marginTop: theme.spacing[2],
  },
  sourceBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    marginTop: theme.spacing[3],
    backgroundColor: theme.colors.surfaceSecondary,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.lg,
  },
  sourceText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  detailsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    ...theme.shadows.md,
  },
  detailRow: {
    paddingVertical: theme.spacing[3.5],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  detailLabel: {
    fontSize: 13,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[1],
  },
  detailValue: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    fontWeight: '500' as const,
  },
  detailEditInput: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    fontWeight: '500' as const,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.primary,
    paddingVertical: theme.spacing[1],
  },
  datePickerButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[3],
    backgroundColor: theme.colors.divider,
    borderRadius: theme.borderRadius.md,
    alignSelf: 'flex-start' as const,
  },
  datePickerText: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    fontWeight: '500' as const,
  },
  categoryGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
    marginTop: theme.spacing[1],
  },
  categoryChip: {
    width: '31%' as const,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  categoryChipText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
  categoryChipTextSelected: {
    color: theme.colors.textInverse,
    fontWeight: '600' as const,
  },
  actionsContainer: {
    marginTop: theme.spacing[2],
  },
  editActions: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
  },
  editButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    gap: theme.spacing[2],
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: theme.colors.primary,
  },
  copyButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.secondary,
    gap: theme.spacing[2],
  },
  copyButtonText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: theme.colors.secondary,
  },
  deleteButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.danger,
    gap: theme.spacing[2],
  },
  deleteButtonText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: theme.colors.danger,
  },
  cancelEditButton: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.textDisabled,
  },
  cancelEditText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textSecondary,
  },
  saveEditButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
    gap: theme.spacing[2],
  },
  saveEditText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textInverse,
  },
  // Items section
  itemsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    ...theme.shadows.md,
  },
  itemsHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[3],
  },
  itemsTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
  },
  addItemButton: {
    padding: theme.spacing[1],
  },
  noItemsText: {
    fontSize: 14,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    paddingVertical: theme.spacing[3],
  },
  itemRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2.5],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  itemInfo: {
    flex: 1,
    marginRight: theme.spacing[3],
  },
  itemName: {
    fontSize: 15,
    color: theme.colors.textPrimary,
    fontWeight: '500' as const,
  },
  itemMeta: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  itemActions: {
    alignItems: 'flex-end' as const,
  },
  itemTotal: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
  },
  itemButtons: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
    marginTop: theme.spacing[1],
  },
  itemIconBtn: {
    padding: theme.spacing[1],
  },
  // Receipt image section
  imageCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    ...theme.shadows.md,
  },
  imageSectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[3],
  },
  receiptThumbnail: {
    width: '100%' as const,
    height: 200,
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing[3],
  },
  imageActions: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  imageActionBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[2.5],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  imageActionText: {
    fontSize: 13,
    color: theme.colors.primary,
    fontWeight: '500' as const,
  },
  addImageBtn: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[6],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed' as const,
  },
  addImageText: {
    fontSize: 14,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[2],
  },
  // Image viewer modal
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  imageModalClose: {
    position: 'absolute' as const,
    top: 50,
    right: 20,
    zIndex: 10,
  },
  imageModalFull: {
    width: '95%' as const,
    height: '80%' as const,
  },
  // Item modal
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'flex-end' as const,
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius['2xl'],
    borderTopRightRadius: theme.borderRadius['2xl'],
    padding: theme.spacing[6],
    paddingBottom: theme.spacing[10],
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[5],
  },
  modalLabel: {
    fontSize: 13,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[1.5],
  },
  modalInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md + 2,
    paddingHorizontal: theme.spacing[3.5],
    paddingVertical: theme.spacing[2.5],
    fontSize: 16,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[3.5],
  },
  modalRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
  },
  modalHalf: {
    flex: 1,
  },
  modalActions: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
    marginTop: theme.spacing[2],
  },
  modalCancel: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: theme.colors.textDisabled,
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textSecondary,
  },
  modalSave: {
    flex: 1,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
  },
  modalSaveText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.textInverse,
  },
  // Splits
  splitRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2],
    gap: theme.spacing[2],
  },
  splitDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  splitName: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.textPrimary,
    fontWeight: '500' as const,
  },
  splitAmount: {
    fontSize: 14,
    color: theme.colors.textPrimary,
    fontWeight: '600' as const,
  },
  splitPercent: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    width: 36,
    textAlign: 'right' as const,
  },
  splitButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    marginTop: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed' as const,
  },
  splitButtonText: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '500' as const,
  },
  // Debt section
  debtSection: {
    marginTop: theme.spacing[4],
    padding: theme.spacing[4],
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    gap: theme.spacing[3],
  },
  debtHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  debtHeaderText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: theme.colors.primary,
  },
  debtRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  debtRowLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  debtRowValue: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: theme.colors.textPrimary,
  },
  recordRepaymentButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.success,
  },
  recordRepaymentText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: theme.colors.success,
  },
  debtRepaymentBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.warningLight || theme.colors.surfaceSecondary,
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    marginTop: theme.spacing[3],
  },
  debtRepaymentText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: theme.colors.warning,
  },
});
