'use client';

import React, { useEffect } from 'react';
import { themes } from '@/lib/themes';

interface StoreThemeProviderProps {
  themeId: string;
  children: React.ReactNode;
}

/**
 * Applies the store's selected theme to the page
 * @param themeId - The theme ID from the store configuration
 * @param children - The content to wrap with the theme
 */
export function StoreThemeProvider({ themeId, children }: StoreThemeProviderProps) {
  useEffect(() => {
    console.log('StoreThemeProvider: Initializing with theme:', themeId);
    console.log('StoreThemeProvider: Available themes:', Object.keys(themes));
    console.log('StoreThemeProvider: Selected theme exists:', !!themes[themeId]);
    
    // Check if theme styles are already applied server-side
    const existingThemeStyle = document.querySelector(`style[data-theme-id="${themeId}"]`);
    console.log('StoreThemeProvider: Server-side theme element found:', !!existingThemeStyle);
    
    if (existingThemeStyle) {
      console.log('StoreThemeProvider: Server-side theme found, applying client-side override to ensure precedence');
      // We still apply the theme variables to override any global theme context
    }

    // Apply theme immediately and with timeout to ensure it overrides global theme
    const applyTheme = () => {
      // Apply the store's theme (overrides global theme)
      const theme = themes[themeId] || themes.default;
      console.log('StoreThemeProvider: Resolved theme:', theme.name);
      console.log('StoreThemeProvider: Theme colors:', theme.colors);
      const root = document.documentElement;
      const body = document.body;
      const colors = theme.colors;

    // Apply theme CSS variables
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
    };

    // Apply theme immediately
    applyTheme();

    // Also apply theme after a short delay to override any global theme context
    const timeoutId = setTimeout(applyTheme, 100);

    // Cleanup function to restore default theme when leaving the store
    return () => {
      clearTimeout(timeoutId);
      console.log('StoreThemeProvider: Restoring default theme');
      const defaultTheme = themes.default;
      const defaultColors = defaultTheme.colors;
      const root = document.documentElement;
      const body = document.body;
      
      root.style.setProperty('--theme-primary', defaultColors.primary);
      root.style.setProperty('--theme-primary-dark', defaultColors.primaryDark);
      root.style.setProperty('--theme-primary-darker', defaultColors.primaryDarker);
      root.style.setProperty('--theme-secondary', defaultColors.secondary);
      root.style.setProperty('--theme-accent', defaultColors.accent);
      
      root.style.setProperty('--theme-background', defaultColors.background);
      root.style.setProperty('--theme-background-secondary', defaultColors.backgroundSecondary);
      root.style.setProperty('--theme-background-tertiary', defaultColors.backgroundTertiary);
      root.style.setProperty('--theme-card', defaultColors.card);
      root.style.setProperty('--theme-card-hover', defaultColors.cardHover);
      
      root.style.setProperty('--theme-text', defaultColors.text);
      root.style.setProperty('--theme-text-secondary', defaultColors.textSecondary);
      root.style.setProperty('--theme-text-muted', defaultColors.textMuted);
      root.style.setProperty('--theme-text-on-primary', defaultColors.textOnPrimary);
      
      root.style.setProperty('--theme-border', defaultColors.border);
      root.style.setProperty('--theme-hover-overlay', defaultColors.hoverOverlay);
      root.style.setProperty('--theme-disabled', defaultColors.disabled);
      
      root.style.setProperty('--theme-success', defaultColors.success);
      root.style.setProperty('--theme-error', defaultColors.error);
      root.style.setProperty('--theme-warning', defaultColors.warning);
      root.style.setProperty('--theme-info', defaultColors.info);
      
      root.style.setProperty('--theme-primary-gradient', defaultColors.primaryGradient);
      root.style.setProperty('--theme-header-gradient', defaultColors.headerGradient);
      root.style.setProperty('--theme-hero-gradient', defaultColors.heroGradient);

      body.style.backgroundColor = defaultColors.background;
      body.style.color = defaultColors.text;
    };
  }, [themeId]);

  return <>{children}</>;
}