import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface TagChipProps {
  name: string;
  color?: string;
  onRemove?: () => void;
  onPress?: () => void;
  selected?: boolean;
  size?: 'small' | 'medium';
}

export const TagChip: React.FC<TagChipProps> = ({
  name,
  color = '#6B7280',
  onRemove,
  onPress,
  selected = false,
  size = 'medium',
}) => {
  const isSmall = size === 'small';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.chip,
        isSmall && styles.chipSmall,
        selected && { backgroundColor: color, borderColor: color },
        !selected && { borderColor: color },
      ]}
    >
      <Text
        style={[
          styles.text,
          isSmall && styles.textSmall,
          selected ? styles.textSelected : { color },
        ]}
      >
        #{name}
      </Text>
      {onRemove && (
        <TouchableOpacity onPress={onRemove} style={styles.removeBtn}>
          <Ionicons name="close-circle" size={isSmall ? 14 : 16} color={selected ? '#fff' : color} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1.5,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: 'transparent',
  },
  chipSmall: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginRight: 4,
    marginBottom: 4,
  },
  text: {
    fontSize: 14,
    fontWeight: '500',
  },
  textSmall: {
    fontSize: 12,
  },
  textSelected: {
    color: '#fff',
  },
  removeBtn: {
    marginLeft: 4,
  },
});
