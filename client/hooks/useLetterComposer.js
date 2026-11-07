import { useCallback, useState } from 'react';
import { DEFAULT_COMPOSITION, normalizeComposition } from '../../shared/letter.js';

// Used both before payment (IndexedDB) and after confirmation (private D1 order).
export function useLetterComposer(initial = DEFAULT_COMPOSITION) {
  const [composition, store] = useState(() => normalizeComposition(initial));
  const setComposition = useCallback((value) => {
    store((previous) => normalizeComposition(typeof value === 'function' ? value(previous) : value));
  }, []);
  return { composition, setComposition };
}
