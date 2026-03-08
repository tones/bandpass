'use client';

import { useCallback } from 'react';
import { InitialSyncScreen } from './InitialSyncScreen';

export function InitialSyncGate() {
  const handleComplete = useCallback(() => {
    window.location.reload();
  }, []);

  return <InitialSyncScreen onComplete={handleComplete} />;
}
