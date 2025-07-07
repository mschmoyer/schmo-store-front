import React from 'react';
import { themes } from './themes';

/**
 * Generates CSS string for theme variables that can be injected server-side
 * @param themeId - The theme ID to generate CSS for
 * @returns CSS string with theme variables
 */
export function generateThemeCSS(themeId: string): string {
  const theme = themes[themeId] || themes.default;
  const colors = theme.colors;

  return `
    :root {
      --theme-primary: ${colors.primary};
      --theme-primary-dark: ${colors.primaryDark};
      --theme-primary-darker: ${colors.primaryDarker};
      --theme-secondary: ${colors.secondary};
      --theme-accent: ${colors.accent};
      
      --theme-background: ${colors.background};
      --theme-background-secondary: ${colors.backgroundSecondary};
      --theme-background-tertiary: ${colors.backgroundTertiary};
      --theme-card: ${colors.card};
      --theme-card-hover: ${colors.cardHover};
      
      --theme-text: ${colors.text};
      --theme-text-secondary: ${colors.textSecondary};
      --theme-text-muted: ${colors.textMuted};
      --theme-text-on-primary: ${colors.textOnPrimary};
      
      --theme-border: ${colors.border};
      --theme-hover-overlay: ${colors.hoverOverlay};
      --theme-disabled: ${colors.disabled};
      
      --theme-success: ${colors.success};
      --theme-error: ${colors.error};
      --theme-warning: ${colors.warning};
      --theme-info: ${colors.info};
      
      --theme-primary-gradient: ${colors.primaryGradient};
      --theme-header-gradient: ${colors.headerGradient};
      --theme-hero-gradient: ${colors.heroGradient};
    }
    
    body {
      background-color: ${colors.background} !important;
      color: ${colors.text} !important;
      transition: background-color 0.3s ease, color 0.3s ease;
    }
  `.trim();
}

/**
 * Creates a style element with theme CSS that can be injected into the head
 * @param themeId - The theme ID to generate CSS for
 * @returns JSX style element
 */
export function ThemeStyleElement({ themeId }: { themeId: string }) {
  const css = generateThemeCSS(themeId);
  
  return (
    <style 
      dangerouslySetInnerHTML={{ __html: css }}
      data-theme-id={themeId}
    />
  );
}