export interface Theme {
  name: string;
  colors: {
    // Brand Colors
    primary: string;
    primaryDark: string;
    primaryDarker: string;
    secondary: string;
    accent: string;
    
    // Background Colors
    background: string;
    backgroundSecondary: string;
    backgroundTertiary: string;
    card: string;
    cardHover: string;
    
    // Text Colors
    text: string;
    textSecondary: string;
    textMuted: string;
    textOnPrimary: string;
    
    // Interactive Colors
    border: string;
    hoverOverlay: string;
    disabled: string;
    
    // Status Colors
    success: string;
    error: string;
    warning: string;
    info: string;
    
    // Gradients
    primaryGradient: string;
    headerGradient: string;
    heroGradient: string;
  };
}

export const themes: Record<string, Theme> = {
  default: {
    name: 'Default Green',
    colors: {
      primary: '#22c55e',
      primaryDark: '#16a34a',
      primaryDarker: '#166534',
      secondary: '#10b981',
      accent: '#059669',
      
      background: '#ffffff',
      backgroundSecondary: '#f9fafb',
      backgroundTertiary: '#f3f4f6',
      card: '#ffffff',
      cardHover: '#f8fafc',
      
      text: '#171717',
      textSecondary: '#374151',
      textMuted: '#6b7280',
      textOnPrimary: '#ffffff',
      
      border: '#e0e0e0',
      hoverOverlay: 'rgba(255,255,255,0.1)',
      disabled: '#6c757d',
      
      success: '#22c55e',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6',
      
      primaryGradient: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
      headerGradient: 'linear-gradient(135deg, #166534 0%, #22c55e 100%)',
      heroGradient: 'linear-gradient(135deg, #f7fdf7 0%, #ecfdf5 50%, #f0fdf4 100%)',
    },
  },
  
  ocean: {
    name: 'Ocean Blue',
    colors: {
      primary: '#3b82f6',
      primaryDark: '#2563eb',
      primaryDarker: '#1d4ed8',
      secondary: '#06b6d4',
      accent: '#0891b2',
      
      background: '#ffffff',
      backgroundSecondary: '#f8fafc',
      backgroundTertiary: '#f1f5f9',
      card: '#ffffff',
      cardHover: '#f8fafc',
      
      text: '#0f172a',
      textSecondary: '#334155',
      textMuted: '#64748b',
      textOnPrimary: '#ffffff',
      
      border: '#e2e8f0',
      hoverOverlay: 'rgba(255,255,255,0.1)',
      disabled: '#64748b',
      
      success: '#10b981',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6',
      
      primaryGradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
      headerGradient: 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)',
      heroGradient: 'linear-gradient(135deg, #f0f8ff 0%, #e0f2fe 50%, #f0f9ff 100%)',
    },
  },
  
  sunset: {
    name: 'Sunset Orange',
    colors: {
      primary: '#f97316',
      primaryDark: '#ea580c',
      primaryDarker: '#c2410c',
      secondary: '#fb923c',
      accent: '#f59e0b',
      
      background: '#ffffff',
      backgroundSecondary: '#fefbf3',
      backgroundTertiary: '#fef3e2',
      card: '#ffffff',
      cardHover: '#fffbf5',
      
      text: '#1c1917',
      textSecondary: '#44403c',
      textMuted: '#78716c',
      textOnPrimary: '#ffffff',
      
      border: '#f3e8d8',
      hoverOverlay: 'rgba(255,255,255,0.1)',
      disabled: '#78716c',
      
      success: '#22c55e',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6',
      
      primaryGradient: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
      headerGradient: 'linear-gradient(135deg, #c2410c 0%, #f97316 100%)',
      heroGradient: 'linear-gradient(135deg, #fef7ed 0%, #fed7aa 50%, #fef3e2 100%)',
    },
  },
  
  purple: {
    name: 'Royal Purple',
    colors: {
      primary: '#8b5cf6',
      primaryDark: '#7c3aed',
      primaryDarker: '#6d28d9',
      secondary: '#a78bfa',
      accent: '#c084fc',
      
      background: '#ffffff',
      backgroundSecondary: '#faf9ff',
      backgroundTertiary: '#f3f2ff',
      card: '#ffffff',
      cardHover: '#fcfbff',
      
      text: '#1e1b4b',
      textSecondary: '#3730a3',
      textMuted: '#6b7280',
      textOnPrimary: '#ffffff',
      
      border: '#e5e7eb',
      hoverOverlay: 'rgba(255,255,255,0.1)',
      disabled: '#6b7280',
      
      success: '#22c55e',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6',
      
      primaryGradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
      headerGradient: 'linear-gradient(135deg, #6d28d9 0%, #8b5cf6 100%)',
      heroGradient: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 50%, #f3f2ff 100%)',
    },
  },
  
  dark: {
    name: 'Dark Mode',
    colors: {
      primary: '#22c55e',
      primaryDark: '#16a34a',
      primaryDarker: '#166534',
      secondary: '#10b981',
      accent: '#059669',
      
      background: '#0a0a0a',
      backgroundSecondary: '#1a1a1a',
      backgroundTertiary: '#2a2a2a',
      card: '#1a1a1a',
      cardHover: '#2a2a2a',
      
      text: '#ededed',
      textSecondary: '#d1d5db',
      textMuted: '#9ca3af',
      textOnPrimary: '#ffffff',
      
      border: '#374151',
      hoverOverlay: 'rgba(255,255,255,0.1)',
      disabled: '#6b7280',
      
      success: '#22c55e',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6',
      
      primaryGradient: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
      headerGradient: 'linear-gradient(135deg, #166534 0%, #22c55e 100%)',
      heroGradient: 'linear-gradient(135deg, #0f1419 0%, #1a2332 50%, #0f1419 100%)',
    },
  },
  
  rose: {
    name: 'Rose Pink',
    colors: {
      primary: '#f43f5e',
      primaryDark: '#e11d48',
      primaryDarker: '#be123c',
      secondary: '#fb7185',
      accent: '#f472b6',
      
      background: '#ffffff',
      backgroundSecondary: '#fdf2f8',
      backgroundTertiary: '#fce7f3',
      card: '#ffffff',
      cardHover: '#fef7f7',
      
      text: '#1f2937',
      textSecondary: '#374151',
      textMuted: '#6b7280',
      textOnPrimary: '#ffffff',
      
      border: '#f3e8eb',
      hoverOverlay: 'rgba(255,255,255,0.1)',
      disabled: '#6b7280',
      
      success: '#22c55e',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6',
      
      primaryGradient: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)',
      headerGradient: 'linear-gradient(135deg, #be123c 0%, #f43f5e 100%)',
      heroGradient: 'linear-gradient(135deg, #fef7f7 0%, #fce7f3 50%, #fdf2f8 100%)',
    },
  },
  
  teal: {
    name: 'Teal Mint',
    colors: {
      primary: '#14b8a6',
      primaryDark: '#0d9488',
      primaryDarker: '#0f766e',
      secondary: '#5eead4',
      accent: '#2dd4bf',
      
      background: '#ffffff',
      backgroundSecondary: '#f0fdfa',
      backgroundTertiary: '#ccfbf1',
      card: '#ffffff',
      cardHover: '#f0fdfa',
      
      text: '#134e4a',
      textSecondary: '#0f766e',
      textMuted: '#6b7280',
      textOnPrimary: '#ffffff',
      
      border: '#e6fffa',
      hoverOverlay: 'rgba(255,255,255,0.1)',
      disabled: '#6b7280',
      
      success: '#22c55e',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6',
      
      primaryGradient: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
      headerGradient: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)',
      heroGradient: 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 50%, #f0fdfa 100%)',
    },
  },
  
  amber: {
    name: 'Amber Gold',
    colors: {
      primary: '#f59e0b',
      primaryDark: '#d97706',
      primaryDarker: '#b45309',
      secondary: '#fbbf24',
      accent: '#fcd34d',
      
      background: '#ffffff',
      backgroundSecondary: '#fffbeb',
      backgroundTertiary: '#fef3c7',
      card: '#ffffff',
      cardHover: '#fffbeb',
      
      text: '#1f2937',
      textSecondary: '#374151',
      textMuted: '#6b7280',
      textOnPrimary: '#ffffff',
      
      border: '#fde68a',
      hoverOverlay: 'rgba(255,255,255,0.1)',
      disabled: '#6b7280',
      
      success: '#22c55e',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6',
      
      primaryGradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      headerGradient: 'linear-gradient(135deg, #b45309 0%, #f59e0b 100%)',
      heroGradient: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 50%, #fffbeb 100%)',
    },
  },
  
  slate: {
    name: 'Slate Gray',
    colors: {
      primary: '#475569',
      primaryDark: '#334155',
      primaryDarker: '#1e293b',
      secondary: '#64748b',
      accent: '#94a3b8',
      
      background: '#ffffff',
      backgroundSecondary: '#f8fafc',
      backgroundTertiary: '#f1f5f9',
      card: '#ffffff',
      cardHover: '#f8fafc',
      
      text: '#0f172a',
      textSecondary: '#334155',
      textMuted: '#64748b',
      textOnPrimary: '#ffffff',
      
      border: '#e2e8f0',
      hoverOverlay: 'rgba(255,255,255,0.1)',
      disabled: '#64748b',
      
      success: '#22c55e',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6',
      
      primaryGradient: 'linear-gradient(135deg, #475569 0%, #334155 100%)',
      headerGradient: 'linear-gradient(135deg, #1e293b 0%, #475569 100%)',
      heroGradient: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #f8fafc 100%)',
    },
  },
  
  crimson: {
    name: 'Crimson Red',
    colors: {
      primary: '#dc2626',
      primaryDark: '#b91c1c',
      primaryDarker: '#991b1b',
      secondary: '#ef4444',
      accent: '#f87171',
      
      background: '#ffffff',
      backgroundSecondary: '#fef2f2',
      backgroundTertiary: '#fecaca',
      card: '#ffffff',
      cardHover: '#fef2f2',
      
      text: '#1f2937',
      textSecondary: '#374151',
      textMuted: '#6b7280',
      textOnPrimary: '#ffffff',
      
      border: '#fca5a5',
      hoverOverlay: 'rgba(255,255,255,0.1)',
      disabled: '#6b7280',
      
      success: '#22c55e',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6',
      
      primaryGradient: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
      headerGradient: 'linear-gradient(135deg, #991b1b 0%, #dc2626 100%)',
      heroGradient: 'linear-gradient(135deg, #fef2f2 0%, #fecaca 50%, #fef2f2 100%)',
    },
  },
};

export const getThemeNames = () => Object.keys(themes);
export const getTheme = (themeName: string) => themes[themeName] || themes.default;