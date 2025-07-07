/**
 * Rebel Alliance Theme Configuration
 * 
 * Bright backgrounds with vibrant Rebel Alliance colors for accents.
 * Dark text for readability on bright backgrounds.
 */

export const rebelTheme = {
  // Core Rebel Alliance colors
  colors: {
    primary: {
      orange: '#FF6B35',      // Rebel orange
      amber: '#FFB800',       // Flight suit amber
      tan: '#D4A574',         // Rebel tan
      green: '#228B22',       // Squadron green
      blue: '#4169E1',        // Rebel blue
      red: '#DC143C',         // Rebel red (minimal use)
    },
    
    // Dark text colors for bright backgrounds
    text: {
      primary: '#1A1A1A',     // Dark text
      secondary: '#4A4A4A',   // Medium gray text
      muted: '#6B6B6B',       // Light gray text
      white: '#FFFFFF',       // White text for dark backgrounds
    },
    
    // Bright background colors
    background: {
      primary: '#FEFEFE',     // Near white
      cream: '#FFF8F0',       // Cream white
      lightOrange: '#FFF4E6', // Light orange tint
      lightAmber: '#FFFBF0',  // Light amber tint
      lightGreen: '#F0FFF0',  // Light green tint
      lightBlue: '#F0F8FF',   // Light blue tint
      lightTan: '#FDF5E6',    // Light tan tint
    },
    
    // Button and interactive element colors
    interactive: {
      primary: '#FF6B35',     // Orange primary
      secondary: '#228B22',   // Green secondary
      tertiary: '#4169E1',    // Blue tertiary
      accent: '#FFB800',      // Amber accent
      hover: {
        primary: '#E55A2B',   // Darker orange
        secondary: '#1F7A1F', // Darker green
        tertiary: '#3A5FCD',  // Darker blue
        accent: '#E6A600',    // Darker amber
      }
    }
  },
  
  // Section-specific backgrounds for visual separation
  sections: {
    hero: 'bg-gradient-to-br from-orange-50 to-amber-50',
    features: 'bg-gradient-to-br from-blue-50 to-cyan-50',
    howItWorks: 'bg-gradient-to-br from-green-50 to-emerald-50',
    demoStores: 'bg-gradient-to-br from-amber-50 to-yellow-50',
    cta: 'bg-gradient-to-br from-orange-100 to-amber-100',
    footer: 'bg-gradient-to-br from-gray-50 to-stone-50'
  },
  
  // Predefined class combinations for common elements
  classes: {
    // Button styles with !important to override Mantine defaults
    button: {
      primary: '!bg-orange-600 hover:!bg-orange-700 !text-white !border-orange-600',
      secondary: '!bg-green-600 hover:!bg-green-700 !text-white !border-green-600',
      tertiary: '!bg-blue-600 hover:!bg-blue-700 !text-white !border-blue-600',
      accent: '!bg-amber-500 hover:!bg-amber-600 !text-gray-900 !border-amber-500',
      outline: {
        primary: '!border-2 !border-orange-600 !text-orange-600 hover:!bg-orange-50 hover:!text-orange-700',
        primaryDark: '!border-2 !border-orange-700 !text-orange-700 hover:!bg-orange-100 hover:!text-orange-800',
        secondary: '!border-2 !border-green-600 !text-green-600 hover:!bg-green-50 hover:!text-green-700',
        tertiary: '!border-2 !border-blue-600 !text-blue-600 hover:!bg-blue-50 hover:!text-blue-700',
        accent: '!border-2 !border-amber-500 !text-amber-600 hover:!bg-amber-50 hover:!text-amber-700',
      }
    },
    
    // Text styles
    text: {
      heading: 'text-gray-900',
      body: 'text-gray-700',
      muted: 'text-gray-600',
      light: 'text-gray-500',
      white: 'text-white',
    },
    
    // Link styles
    link: {
      primary: '!text-orange-600 hover:!text-orange-700',
      secondary: '!text-green-600 hover:!text-green-700',
      tertiary: '!text-blue-600 hover:!text-blue-700',
      accent: '!text-amber-600 hover:!text-amber-700',
    },
    
    // Card and container styles
    card: {
      background: 'bg-white',
      border: 'border-gray-200',
      shadow: 'shadow-sm hover:shadow-md',
    }
  }
} as const;

export type RebelTheme = typeof rebelTheme;