'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Theme, themes } from '@/lib/themes';

interface ThemeContextType {
  currentTheme: Theme;
  themeName: string;
  setTheme: (themeName: string) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeName, setThemeName] = useState('default');
  const [currentTheme, setCurrentTheme] = useState(themes.default);

  useEffect(() => {
    // Load theme from localStorage on client side
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme && themes[savedTheme]) {
      console.log('ThemeProvider: Loading saved theme:', savedTheme);
      setThemeName(savedTheme);
      setCurrentTheme(themes[savedTheme]);
    }
  }, []);

  const setTheme = (newThemeName: string) => {
    console.log('ThemeProvider: Setting theme to:', newThemeName);
    if (themes[newThemeName]) {
      setThemeName(newThemeName);
      setCurrentTheme(themes[newThemeName]);
      localStorage.setItem('theme', newThemeName);
    } else {
      console.error('ThemeProvider: Theme not found:', newThemeName);
    }
  };

  // Apply theme CSS variables to the document root and body
  useEffect(() => {
    // Check if we're on a store page - if so, don't override store theme
    const pathname = window.location.pathname;
    const isStorePage = pathname.startsWith('/store/') || 
                        (pathname.split('/').length === 2 && pathname !== '/admin' && pathname !== '/');
    
    if (isStorePage) {
      console.log('ThemeProvider: Detected store page, skipping global theme application');
      return;
    }
    
    console.log('ThemeProvider: Applying global theme:', themeName);
    const root = document.documentElement;
    const body = document.body;
    const colors = currentTheme.colors;

    root.style.setProperty('--theme-primary', colors.primary);
    root.style.setProperty('--theme-primary-dark', colors.primaryDark);
    root.style.setProperty('--theme-primary-darker', colors.primaryDarker);
    root.style.setProperty('--theme-secondary', colors.secondary);
    root.style.setProperty('--theme-accent', colors.accent);
    
    root.style.setProperty('--theme-background', colors.background);
    root.style.setProperty('--theme-background-secondary', colors.backgroundSecondary);
    root.style.setProperty('--theme-background-tertiary', colors.backgroundTertiary);
    root.style.setProperty('--theme-card', colors.card);
    root.style.setProperty('--theme-card-hover', colors.cardHover);
    
    root.style.setProperty('--theme-text', colors.text);
    root.style.setProperty('--theme-text-secondary', colors.textSecondary);
    root.style.setProperty('--theme-text-muted', colors.textMuted);
    root.style.setProperty('--theme-text-on-primary', colors.textOnPrimary);
    
    root.style.setProperty('--theme-border', colors.border);
    root.style.setProperty('--theme-hover-overlay', colors.hoverOverlay);
    root.style.setProperty('--theme-disabled', colors.disabled);
    
    root.style.setProperty('--theme-success', colors.success);
    root.style.setProperty('--theme-error', colors.error);
    root.style.setProperty('--theme-warning', colors.warning);
    root.style.setProperty('--theme-info', colors.info);
    
    root.style.setProperty('--theme-primary-gradient', colors.primaryGradient);
    root.style.setProperty('--theme-header-gradient', colors.headerGradient);
    root.style.setProperty('--theme-hero-gradient', colors.heroGradient);

    // Apply background color to body
    body.style.backgroundColor = colors.background;
    body.style.color = colors.text;
    body.style.transition = 'background-color 0.3s ease, color 0.3s ease';
  }, [currentTheme, themeName]);

  return (
    <ThemeContext.Provider value={{ currentTheme, themeName, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};