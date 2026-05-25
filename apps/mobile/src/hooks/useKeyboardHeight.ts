import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

// Pure-JS keyboard height tracker (no native module — builds on Windows).
// Reads the keyboard frame from RN's Keyboard events, which fire on both
// platforms regardless of New Architecture / Android edge-to-edge, so callers
// can lift/pad content above the keyboard deterministically.
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setHeight(e.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setHeight(0));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}
