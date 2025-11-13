'use client';

import React, { useEffect, useState } from 'react';
import { Theme, ThemeContext } from './theme-context';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'gossip-theme',
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return defaultTheme;
    const stored = localStorage.getItem(storageKey) as Theme | null;
    return stored || defaultTheme;
  });

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    return theme;
  });

  useEffect(() => {
    const root = document.documentElement;

    const updateTheme = () => {
      const resolved =
        theme === 'system'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          : theme;

      setResolvedTheme(resolved);

      if (resolved === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }

      // Update status bar style for native platforms
      if (Capacitor.isNativePlatform()) {
        // Set status bar content color based on theme
        void StatusBar.setStyle({
          style: resolved === 'dark' ? Style.Dark : Style.Light,
        });

        // Also update status bar background color to match app theme exactly
        // Use exact hex values from CSS variables to ensure perfect match
        const statusBarColor = resolved === 'dark' ? '#18181b' : '#f8f9fa';
        void StatusBar.setBackgroundColor({
          color: statusBarColor,
        }).catch(err => {
          console.warn('Failed to set status bar color:', err);
        });
      }
    };

    updateTheme();

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => updateTheme();
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, newTheme);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
