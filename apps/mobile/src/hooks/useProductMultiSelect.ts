import { useCallback, useState } from 'react';

export function useProductMultiSelect() {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((rawName: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rawName)) next.delete(rawName);
      else next.add(rawName);
      return next;
    });
  }, []);

  const enterSelect = useCallback(() => setSelecting(true), []);

  const exitSelect = useCallback(() => {
    setSelecting(false);
    setSelected(new Set());
  }, []);

  return { selecting, selected, toggleSelect, enterSelect, exitSelect };
}
