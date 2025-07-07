'use client';

import React from 'react';

interface RebelCartLogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
  color?: 'default' | 'white' | 'black';
  darkBackground?: boolean;
}

export function RebelCartLogo({ 
  size = 32, 
  className = '', 
  showText = true,
  color = 'default',
  darkBackground = false
}: RebelCartLogoProps) {
  // Always use dark red (#dc2626) for the logo, regardless of background
  const logoColor = '#dc2626';
  const textColor = darkBackground ? '#ffffff' : color === 'white' ? '#ffffff' : '#000000';
  const strokeColor = darkBackground ? '#ffffff' : 'none';
  const strokeWidth = darkBackground ? '0.5' : '0';
  
  return (
    <div className={`flex items-center ${className}`}>
      <svg 
        width={size} 
        height={size} 
        viewBox="0 0 48 48" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className="mr-2"
      >
        {/* Shopping cart base */}
        <path 
          d="M7 7H11L14.5 25.5H33.5L37 13H15" 
          stroke={logoColor} 
          strokeWidth="2.5" 
          strokeLinecap="round" 
          strokeLinejoin="round"
          fill="none"
          style={{ 
            ...(darkBackground && { 
              filter: `drop-shadow(0 0 ${strokeWidth}px ${strokeColor})` 
            })
          }}
        />
        
        {/* Cart wheels */}
        <circle 
          cx="16" 
          cy="35" 
          r="2.5" 
          fill={logoColor}
          style={{ 
            ...(darkBackground && { 
              filter: `drop-shadow(0 0 ${strokeWidth}px ${strokeColor})` 
            })
          }}
        />
        <circle 
          cx="31" 
          cy="35" 
          r="2.5" 
          fill={logoColor}
          style={{ 
            ...(darkBackground && { 
              filter: `drop-shadow(0 0 ${strokeWidth}px ${strokeColor})` 
            })
          }}
        />
        
        {/* Rebel elements - jagged edges on cart */}
        <path 
          d="M14.5 25.5L16 22L18 25.5L20 22L22 25.5L24 22L26 25.5L28 22L30 25.5L31.5 22L33.5 25.5" 
          stroke={logoColor} 
          strokeWidth="2" 
          strokeLinecap="round" 
          fill="none"
          style={{ 
            ...(darkBackground && { 
              filter: `drop-shadow(0 0 ${strokeWidth}px ${strokeColor})` 
            })
          }}
        />
        
        {/* Rebel flag/banner on cart */}
        <path 
          d="M33.5 25.5L33.5 15L39 18L33.5 21" 
          fill={logoColor}
          stroke={logoColor}
          strokeWidth="1"
          style={{ 
            ...(darkBackground && { 
              filter: `drop-shadow(0 0 ${strokeWidth}px ${strokeColor})` 
            })
          }}
        />
        
        {/* Power/lightning bolt inside cart */}
        <path 
          d="M22 20L20 23H22.5L21 26L23 23H21.5L22 20Z" 
          fill={logoColor}
          style={{ 
            ...(darkBackground && { 
              filter: `drop-shadow(0 0 ${strokeWidth}px ${strokeColor})` 
            })
          }}
        />
      </svg>
      
      {showText && (
        <div className="flex flex-col">
          <span 
            className="font-bold text-lg leading-tight"
            style={{ 
              color: textColor,
              ...(darkBackground && {
                textShadow: `0 0 2px ${strokeColor}, 0 0 4px ${strokeColor}`
              })
            }}
          >
            RebelCart
          </span>
          <span 
            className="text-xs font-medium opacity-80 leading-tight"
            style={{ 
              color: textColor,
              ...(darkBackground && {
                textShadow: `0 0 2px ${strokeColor}, 0 0 4px ${strokeColor}`
              })
            }}
          >
            Take Back Your Margins
          </span>
        </div>
      )}
    </div>
  );
}