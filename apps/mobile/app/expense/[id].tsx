import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useExpenseStore } from '@/stores/expenseStore';
import { formatCurrency, formatDate } from '@budget/shared-utils';
import type { Currency } from '@budget/shared-types';

export default function ExpenseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { expenses, updateExpense, deleteExpense } = useExpenseStore();
  const expense = expenses.find((e) => e.id === id);

  const [isEditing, setIsEditing] = useState(false);
  const [editDescription, setEditDescription] = useState(expense?.description || '');
  const [editAmount, setEditAmount] = useState(expense?.amount?.toString() || '');

  if (!expense) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={64} color="#ccc" />
          <Text style={styles.notFoundText}>Expense not found</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleDelete = () => {
    Alert.alert('Delete Expense', 'Are you sure you want to delete this expense?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
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
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    updateExpense(expense.id, {
      amount: numericAmount,
      description: editDescription.trim(),
    });
    setIsEditing(false);
  };

  const sourceLabel: Record<string, string> = {
    manual: 'Manual Entry',
    voice: 'Voice Input',
    ocr: 'Receipt Scan',
    import: 'Imported',
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
            <Text style={styles.detailLabel}>Description</Text>
            {isEditing ? (
              <TextInput
                style={styles.detailEditInput}
                value={editDescription}
                onChangeText={setEditDescription}
              />
            ) : (
              <Text style={styles.detailValue}>{expense.description || 'No description'}</Text>
            )}
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Date</Text>
            <Text style={styles.detailValue}>{formatDate(expense.date)}</Text>
          </View>

          {expense.categoryId && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Category</Text>
              <Text style={styles.detailValue}>{expense.categoryId}</Text>
            </View>
          )}

          {expense.notes && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Notes</Text>
              <Text style={styles.detailValue}>{expense.notes}</Text>
            </View>
          )}

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Sync Status</Text>
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
                <Text style={styles.cancelEditText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveEditButton} onPress={handleSaveEdit}>
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.saveEditText}>Save</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.editActions}>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => setIsEditing(true)}
              >
                <Ionicons name="pencil" size={20} color="#4ECDC4" />
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                <Ionicons name="trash" size={20} color="#FF6B6B" />
                <Text style={styles.deleteButtonText}>Delete</Text>
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
});
