import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { TagChip } from './TagChip';
import { useTagStore } from '../stores/tagStore';
import { api } from '../services/api';

interface TagPickerProps {
  selectedTagIds: string[];
  onTagsChange: (tagIds: string[]) => void;
  description?: string; // For AI suggestions
}

export const TagPicker: React.FC<TagPickerProps> = ({
  selectedTagIds,
  onTagsChange,
  description,
}) => {
  const { t } = useTranslation();
  const { tags, createTag, searchTags, getMostUsedTags } = useTagStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestedTags, setSuggestedTags] = useState<{ name: string; confidence: number; existingTagId?: string }[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  // Fetch AI suggestions when description changes
  useEffect(() => {
    if (!description || description.length < 3) return;
    setIsLoadingSuggestions(true);
    api.suggestTags(description).then((result: any) => {
      if (result?.tags) setSuggestedTags(result.tags);
    }).catch(() => {}).finally(() => setIsLoadingSuggestions(false));
  }, [description]);

  const filteredTags = searchQuery
    ? searchTags(searchQuery)
    : getMostUsedTags(15);

  const selectedTags = tags.filter(t => selectedTagIds.includes(t.id));
  const unselectedTags = filteredTags.filter(t => !selectedTagIds.includes(t.id));

  const handleToggleTag = useCallback((tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onTagsChange(selectedTagIds.filter(id => id !== tagId));
    } else {
      onTagsChange([...selectedTagIds, tagId]);
    }
  }, [selectedTagIds, onTagsChange]);

  const handleCreateAndAdd = useCallback(async (name: string) => {
    const tag = await createTag(name.trim());
    onTagsChange([...selectedTagIds, tag.id]);
    setSearchQuery('');
  }, [createTag, selectedTagIds, onTagsChange]);

  const handleSuggestionPress = useCallback(async (suggestion: { name: string; existingTagId?: string }) => {
    if (suggestion.existingTagId) {
      if (!selectedTagIds.includes(suggestion.existingTagId)) {
        onTagsChange([...selectedTagIds, suggestion.existingTagId]);
      }
    } else {
      await handleCreateAndAdd(suggestion.name);
    }
  }, [selectedTagIds, onTagsChange, handleCreateAndAdd]);

  return (
    <View style={styles.container}>
      {/* Selected tags */}
      {selectedTags.length > 0 && (
        <View style={styles.selectedRow}>
          {selectedTags.map(tag => (
            <TagChip
              key={tag.id}
              name={tag.name}
              color={tag.color}
              selected
              onRemove={() => handleToggleTag(tag.id)}
            />
          ))}
        </View>
      )}

      {/* AI suggestions */}
      {suggestedTags.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {isLoadingSuggestions ? (
              <ActivityIndicator size="small" />
            ) : (
              `${t('tags.aiSuggestions') || 'AI Suggestions'}`
            )}
          </Text>
          <View style={styles.tagRow}>
            {suggestedTags.map((suggestion, idx) => (
              <TagChip
                key={`ai-${idx}`}
                name={suggestion.name}
                color="#8B5CF6"
                size="small"
                onPress={() => handleSuggestionPress(suggestion)}
              />
            ))}
          </View>
        </View>
      )}

      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color="#9CA3AF" />
        <TextInput
          style={styles.searchInput}
          placeholder={t('tags.tagName') || 'Search or create tag...'}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && !tags.find(t => t.name.toLowerCase() === searchQuery.toLowerCase()) && (
          <TouchableOpacity onPress={() => handleCreateAndAdd(searchQuery)} style={styles.createBtn}>
            <Ionicons name="add-circle" size={24} color="#6366F1" />
          </TouchableOpacity>
        )}
      </View>

      {/* Available tags */}
      <View style={styles.tagRow}>
        {unselectedTags.map(tag => (
          <TagChip
            key={tag.id}
            name={tag.name}
            color={tag.color}
            onPress={() => handleToggleTag(tag.id)}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  selectedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  section: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
    fontWeight: '600',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    fontSize: 14,
    color: '#111827',
  },
  createBtn: {
    padding: 4,
  },
});
