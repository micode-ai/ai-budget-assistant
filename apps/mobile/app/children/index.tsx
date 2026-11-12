import React from 'react';
import { ChildrenList } from '@/components/children/ChildrenList';

/** Children (child costs). Thin: the body lives under `src/`; the header is registered in `app/_layout.tsx`. */
export default function ChildrenScreen() {
  return <ChildrenList />;
}
