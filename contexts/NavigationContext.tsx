'use client';

import { createContext, useContext, useRef } from 'react';

interface NavigationContextValue {
  lastMusicPath: React.MutableRefObject<string>;
  lastCratesPath: React.MutableRefObject<string>;
  lastTimelinePath: React.MutableRefObject<string>;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const lastMusicPath = useRef('/music');
  const lastCratesPath = useRef('/crates');
  const lastTimelinePath = useRef('/timeline');
  return (
    <NavigationContext.Provider value={{ lastMusicPath, lastCratesPath, lastTimelinePath }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used within NavigationProvider');
  return ctx;
}
