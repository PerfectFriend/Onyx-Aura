import { useState, useEffect } from 'react';
import { 
  TRANSLATIONS, 
  LANGUAGES, 
  SupportedLanguage, 
  detectUserLanguage,
  TranslationStrings 
} from '../i18n/translations';
import { ThemeMode, WallpaperTheme } from '../types';

export interface UseAppChromeReturn {
  currentLanguage: SupportedLanguage;
  setCurrentLanguage: (lang: SupportedLanguage) => void;
  t: TranslationStrings;
  theme: ThemeMode;
  handleToggleTheme: () => void;
  wallpaper: WallpaperTheme;
  isWallpaperModalOpen: boolean;
  setIsWallpaperModalOpen: (open: boolean) => void;
  handleSelectWallpaper: (wp: WallpaperTheme) => void;
}

/**
 * Custom hook to encapsulate global UI Chrome concerns:
 * - Language selection, translation bundle, and HTML dir/lang attributes
 * - Theme mode ('dark' | 'light') with system preference fallback and body class syncing
 * - Luxury Wallpaper selection and persistence
 */
export function useAppChrome(): UseAppChromeReturn {
  // Localization State (Top 10 Languages with auto-detection)
  const [currentLanguage, setCurrentLanguage] = useState<SupportedLanguage>(() => detectUserLanguage());
  const t = TRANSLATIONS[currentLanguage] || TRANSLATIONS.en;

  // Theme Mode State ('dark' | 'light') with system detection & persistence
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('nailix_theme');
      if (saved === 'light' || saved === 'dark') return saved;
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return 'dark';
  });

  // Sync theme to document.body and documentElement class & localStorage
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.className = theme === 'dark' ? 'theme-dark' : 'theme-light';
      if (theme === 'dark') {
        document.documentElement.classList.add('theme-dark', 'dark');
        document.documentElement.classList.remove('theme-light', 'light');
      } else {
        document.documentElement.classList.add('theme-light', 'light');
        document.documentElement.classList.remove('theme-dark', 'dark');
      }
      localStorage.setItem('nailix_theme', theme);
    }
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // Sync HTML lang and text direction (e.g. for Arabic RTL)
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = currentLanguage;
      const langMeta = LANGUAGES.find(l => l.code === currentLanguage);
      document.documentElement.dir = langMeta?.direction || 'ltr';
    }
  }, [currentLanguage]);

  // Luxury Wallpaper & Ornament Selector
  const [wallpaper, setWallpaper] = useState<WallpaperTheme>(() => {
    try {
      return (localStorage.getItem('nailix_wallpaper') as WallpaperTheme) || 'damask';
    } catch {
      return 'damask';
    }
  });
  const [isWallpaperModalOpen, setIsWallpaperModalOpen] = useState<boolean>(false);

  const handleSelectWallpaper = (wp: WallpaperTheme) => {
    setWallpaper(wp);
    try {
      localStorage.setItem('nailix_wallpaper', wp);
    } catch {
      // Ignore localStorage errors
    }
  };

  return {
    currentLanguage,
    setCurrentLanguage,
    t,
    theme,
    handleToggleTheme,
    wallpaper,
    isWallpaperModalOpen,
    setIsWallpaperModalOpen,
    handleSelectWallpaper,
  };
}
