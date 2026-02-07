import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  Image,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system/next';
import * as Sharing from 'expo-sharing';
import { useExpenseStore } from '@/stores/expenseStore';
import { formatCurrency, formatDate } from '@budget/shared-utils';
import type { Currency, ExpenseItem } from '@budget/shared-types';

export default function ExpenseDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
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
  const expense = expenses.find((e) => e.id === id);

  const [isEditing, setIsEditing] = useState(false);
  const [editDescription, setEditDescription] = useState(expense?.description || '');
  const [editAmount, setEditAmount] = useState(expense?.amount?.toString() || '');

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
    if (id && expense?.source === 'ocr') {
      loadExpenseItems(id);
    }
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
  }, [id]);

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
  const handleDownloadImage = async () => {
    if (!receiptImageBase64) return;
    const file = new File(Paths.cache, `receipt-${id}.jpg`);
    file.write(receiptImageBase64, { encoding: 'base64' });
    await Sharing.shareAsync(file.uri, { mimeType: 'image/jpeg' });
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
          <Ionicons name="alert-circle-outline" size={64} color="#ccc" />
          <Text style={styles.notFoundText}>{t('expenseDetail.notFound')}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>{t('common.back')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

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
    });
    setIsEditing(false);
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
          <View style={styles.sourceBadge}>
            <Ionicons
              name={(sourceIcon[expense.source] || 'help-circle-outline') as any}
              size={14}
              color="#666"
            />
            <Text style={styles.sourceText}>{sourceLabel[expense.source] || expense.source}</Text>
          </View>
        </View>

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
            <Text style={styles.detailValue}>{formatDate(expense.date)}</Text>
          </View>

          {expense.categoryId && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t('expenseDetail.category')}</Text>
              <Text style={styles.detailValue}>{expense.categoryId}</Text>
            </View>
          )}

          {expense.notes && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t('expenseDetail.notes')}</Text>
              <Text style={styles.detailValue}>{expense.notes}</Text>
            </View>
          )}

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('expenseDetail.syncStatus')}</Text>
            <View style={styles.syncStatusContainer}>
              <Ionicons
                name={
                  expense.syncStatus === 'synced'
                    ? 'checkmark-circle'
                    : expense.syncStatus === 'pending'
                      ? 'cloud-upload-outline'
                      : 'alert-circle'
                }
                size={16}
                color={
                  expense.syncStatus === 'synced'
                    ? '#4ECDC4'
                    : expense.syncStatus === 'pending'
                      ? '#999'
                      : '#FF6B6B'
                }
              />
              <Text style={styles.syncStatusText}>{expense.syncStatus}</Text>
            </View>
          </View>
        </View>

        {/* Receipt Items (for OCR expenses) */}
        {expense.source === 'ocr' && (
          <View style={styles.itemsCard}>
            <View style={styles.itemsHeader}>
              <Text style={styles.itemsTitle}>{t('expenseDetail.receiptItems')}</Text>
              <TouchableOpacity onPress={openAddItem} style={styles.addItemButton}>
                <Ionicons name="add-circle-outline" size={24} color="#4ECDC4" />
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
                        <Ionicons name="pencil-outline" size={16} color="#4ECDC4" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteItem(item)} style={styles.itemIconBtn}>
                        <Ionicons name="trash-outline" size={16} color="#FF6B6B" />
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
              <ActivityIndicator size="small" color="#4ECDC4" style={{ marginVertical: 16 }} />
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
                    <Ionicons name="eye-outline" size={18} color="#4ECDC4" />
                    <Text style={styles.imageActionText}>{t('expenseDetail.viewImage')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.imageActionBtn} onPress={handleDownloadImage}>
                    <Ionicons name="download-outline" size={18} color="#4ECDC4" />
                    <Text style={styles.imageActionText}>{t('expenseDetail.downloadImage')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.imageActionBtn} onPress={handleReplaceImage}>
                    <Ionicons name="swap-horizontal-outline" size={18} color="#45B7D1" />
                    <Text style={[styles.imageActionText, { color: '#45B7D1' }]}>{t('expenseDetail.replaceImage')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.imageActionBtn} onPress={handleDeleteImage}>
                    <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
                    <Text style={[styles.imageActionText, { color: '#FF6B6B' }]}>{t('expenseDetail.deleteImage')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <TouchableOpacity style={styles.addImageBtn} onPress={handleReplaceImage}>
                <Ionicons name="image-outline" size={32} color="#ccc" />
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
                }}
              >
                <Text style={styles.cancelEditText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveEditButton} onPress={handleSaveEdit}>
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.saveEditText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.editActions}>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => setIsEditing(true)}
              >
                <Ionicons name="pencil" size={20} color="#4ECDC4" />
                <Text style={styles.editButtonText}>{t('common.edit')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                <Ionicons name="trash" size={20} color="#FF6B6B" />
                <Text style={styles.deleteButtonText}>{t('common.delete')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  notFoundText: {
    fontSize: 18,
    color: '#999',
    marginTop: 16,
  },
  backButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#4ECDC4',
    borderRadius: 12,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
  },
  amountCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  amountText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FF6B6B',
  },
  amountEditInput: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#4ECDC4',
    paddingBottom: 4,
    minWidth: 150,
  },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  sourceText: {
    fontSize: 13,
    color: '#666',
  },
  detailsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  detailRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailLabel: {
    fontSize: 13,
    color: '#999',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  detailEditInput: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
    borderBottomWidth: 1,
    borderBottomColor: '#4ECDC4',
    paddingVertical: 4,
  },
  syncStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  syncStatusText: {
    fontSize: 14,
    color: '#666',
    textTransform: 'capitalize',
  },
  actionsContainer: {
    marginTop: 8,
  },
  editActions: {
    flexDirection: 'row',
    gap: 12,
  },
  editButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#4ECDC4',
    gap: 8,
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4ECDC4',
  },
  deleteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FF6B6B',
    gap: 8,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  cancelEditButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ccc',
  },
  cancelEditText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  saveEditButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#4ECDC4',
    gap: 8,
  },
  saveEditText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  // Items section
  itemsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  itemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  addItemButton: {
    padding: 4,
  },
  noItemsText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 12,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  itemInfo: {
    flex: 1,
    marginRight: 12,
  },
  itemName: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
  },
  itemMeta: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  itemActions: {
    alignItems: 'flex-end',
  },
  itemTotal: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  itemButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  itemIconBtn: {
    padding: 4,
  },
  // Receipt image section
  imageCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  imageSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  receiptThumbnail: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 12,
  },
  imageActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  imageActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  imageActionText: {
    fontSize: 13,
    color: '#4ECDC4',
    fontWeight: '500',
  },
  addImageBtn: {
    alignItems: 'center',
    paddingVertical: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
  },
  addImageText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  // Image viewer modal
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
  },
  imageModalFull: {
    width: '95%',
    height: '80%',
  },
  // Item modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 20,
  },
  modalLabel: {
    fontSize: 13,
    color: '#999',
    marginBottom: 6,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: '#333',
    marginBottom: 14,
  },
  modalRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modalHalf: {
    flex: 1,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalCancel: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ccc',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  modalSave: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#4ECDC4',
  },
  modalSaveText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
