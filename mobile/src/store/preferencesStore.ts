/**
 * Aught2 Pickleball — App Preferences Store
 *
 * Persists client-side user experience settings:
 *   - Date format (YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY)
 *   - Time format (12h, 24h)
 *   - System language
 */

import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type DateFormat = 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY';
export type TimeFormat = '12h' | '24h';

const PREF_STORAGE_KEY = 'aught2_user_preferences';

interface AppPreferencesState {
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
  language: string;
  isLoaded: boolean;

  setDateFormat: (format: DateFormat) => void;
  setTimeFormat: (format: TimeFormat) => void;
  setLanguage: (lang: string) => void;
  loadPreferences: () => Promise<void>;
}

function getWebStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

async function persistPreferences(prefs: {
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
  language: string;
}) {
  const json = JSON.stringify(prefs);
  if (Platform.OS === 'web') {
    const storage = getWebStorage();
    if (storage) {
      try {
        storage.setItem(PREF_STORAGE_KEY, json);
      } catch {
        // Ignored
      }
    }
    return;
  }

  try {
    await SecureStore.setItemAsync(PREF_STORAGE_KEY, json);
  } catch {
    // Ignored
  }
}

export const usePreferencesStore = create<AppPreferencesState>((set, get) => ({
  dateFormat: 'YYYY-MM-DD',
  timeFormat: '12h',
  language: 'en',
  isLoaded: false,

  loadPreferences: async () => {
    let savedJson: string | null = null;
    if (Platform.OS === 'web') {
      const storage = getWebStorage();
      if (storage) {
        try {
          savedJson = storage.getItem(PREF_STORAGE_KEY);
        } catch {
          savedJson = null;
        }
      }
    } else {
      try {
        savedJson = await SecureStore.getItemAsync(PREF_STORAGE_KEY);
      } catch {
        savedJson = null;
      }
    }

    if (savedJson) {
      try {
        const parsed = JSON.parse(savedJson);
        set({
          dateFormat: parsed.dateFormat || 'YYYY-MM-DD',
          timeFormat: parsed.timeFormat || '12h',
          language: parsed.language || 'en',
          isLoaded: true,
        });
        return;
      } catch {
        // Fallback
      }
    }
    set({ isLoaded: true });
  },

  setDateFormat: (format: DateFormat) => {
    set({ dateFormat: format });
    const { timeFormat, language } = get();
    persistPreferences({ dateFormat: format, timeFormat, language });
  },

  setTimeFormat: (format: TimeFormat) => {
    set({ timeFormat: format });
    const { dateFormat, language } = get();
    persistPreferences({ dateFormat, timeFormat: format, language });
  },

  setLanguage: (lang: string) => {
    set({ language: lang });
    const { dateFormat, timeFormat } = get();
    persistPreferences({ dateFormat, timeFormat, language: lang });
  },
}));

// Auto-load preferences on import
usePreferencesStore.getState().loadPreferences();
