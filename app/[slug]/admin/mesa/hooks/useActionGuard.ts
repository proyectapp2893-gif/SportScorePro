'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * Guards an operational button synchronously. A state-only guard is not enough
 * here because two pointer events can arrive before React renders the disabled
 * state. The ref closes that gap while the state drives the visual feedback.
 */
export function useActionGuard() {
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const tryStart = useCallback(() => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    return true;
  }, []);

  const stop = useCallback(() => {
    busyRef.current = false;
    setBusy(false);
  }, []);

  return { busy, tryStart, stop };
}
