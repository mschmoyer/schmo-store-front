'use client';

import * as React from 'react';
import type { PresetThumbnail as PresetThumbnailData } from '@/lib/storefront-theme/types';

export interface PresetThumbnailProps {
  thumbnail: PresetThumbnailData;
  /** Preset name, used only for the accessible description. */
  name: string;
}

/**
 * A miniature of the storefront a preset produces.
 *
 * Drawn from the preset's own `thumbnail` block — its real ground, surface,
 * brand colour, corner radius, header layout, button treatment and product-card
 * ratio — so the six previews differ structurally, not just in hue. That block
 * is derived from the preset's actual theme in `presets.ts`, which means this
 * cannot drift away from what the merchant gets.
 *
 * @param props - {@link PresetThumbnailProps}
 * @returns An inline SVG preview
 */
export default function PresetThumbnail({
  thumbnail,
  name,
}: PresetThumbnailProps): React.ReactElement {
  const r = Math.min(thumbnail.radiusPx, 8);
  const centered = thumbnail.headerLayout === 'logo-center';
  const navBelow = thumbnail.headerLayout === 'logo-left-nav-below';
  const headerHeight = navBelow ? 22 : 15;

  // Card image proportions follow the preset's real product-card ratio.
  const cardImageHeight =
    thumbnail.imageRatio === 'portrait' ? 34 : thumbnail.imageRatio === 'landscape' ? 18 : 26;

  const cardTop = headerHeight + 20;
  const cardWidth = 34;
  const gap = 5;
  const startX = 8;

  const buttonFill = thumbnail.buttonStyle === 'outline' ? 'none' : thumbnail.brand;
  const buttonOpacity = thumbnail.buttonStyle === 'soft' ? 0.22 : 1;
  const buttonStroke = thumbnail.buttonStyle === 'outline' ? thumbnail.brand : 'none';

  return (
    <svg
      viewBox="0 0 124 96"
      width="100%"
      height="auto"
      role="img"
      aria-label={`${name} preview`}
      style={{ display: 'block' }}
    >
      <rect width="124" height="96" fill={thumbnail.background} />

      {/* Header */}
      <rect width="124" height={headerHeight} fill={thumbnail.surface} />
      <line
        x1="0"
        y1={headerHeight}
        x2="124"
        y2={headerHeight}
        stroke={thumbnail.border}
        strokeWidth="1"
      />
      <rect
        x={centered ? 50 : 8}
        y="5"
        width="24"
        height="5"
        rx={Math.min(r, 2.5)}
        fill={thumbnail.brand}
      />
      {navBelow ? (
        <>
          <rect x="8" y="15" width="14" height="3" rx="1.5" fill={thumbnail.textMuted} opacity="0.6" />
          <rect x="26" y="15" width="12" height="3" rx="1.5" fill={thumbnail.textMuted} opacity="0.6" />
          <rect x="42" y="15" width="16" height="3" rx="1.5" fill={thumbnail.textMuted} opacity="0.6" />
        </>
      ) : (
        <>
          <rect
            x={centered ? 12 : 86}
            y="6"
            width="12"
            height="3"
            rx="1.5"
            fill={thumbnail.textMuted}
            opacity="0.6"
          />
          <rect
            x={centered ? 100 : 102}
            y="6"
            width="14"
            height="3"
            rx="1.5"
            fill={thumbnail.textMuted}
            opacity="0.6"
          />
        </>
      )}

      {/* Hero line + button */}
      <rect
        x={centered ? 26 : 8}
        y={headerHeight + 7}
        width={centered ? 72 : 62}
        height="6"
        rx={Math.min(r, 2)}
        fill={thumbnail.text}
        opacity={thumbnail.headingCase === 'uppercase' ? 0.92 : 0.82}
      />
      <rect
        x={centered ? 86 : 76}
        y={headerHeight + 6}
        width="30"
        height="8"
        rx={Math.min(r, 4)}
        fill={buttonFill}
        fillOpacity={buttonOpacity}
        stroke={buttonStroke}
        strokeWidth={buttonStroke === 'none' ? 0 : 1}
      />

      {/* Product cards */}
      {[0, 1, 2].map((index) => {
        const x = startX + index * (cardWidth + gap);
        return (
          <g key={index}>
            <rect
              x={x}
              y={cardTop}
              width={cardWidth}
              height={cardImageHeight + 16}
              rx={r}
              fill={thumbnail.surface}
              stroke={thumbnail.border}
              strokeWidth="1"
            />
            <rect
              x={x + 3}
              y={cardTop + 3}
              width={cardWidth - 6}
              height={cardImageHeight}
              rx={Math.max(r - 2, 0)}
              fill={thumbnail.brand}
              opacity={thumbnail.imageRatio === 'landscape' ? 0.18 : 0.34}
            />
            <rect
              x={x + 3}
              y={cardTop + cardImageHeight + 6}
              width={cardWidth - 12}
              height="3"
              rx="1.5"
              fill={thumbnail.text}
              opacity="0.7"
            />
            <rect
              x={x + 3}
              y={cardTop + cardImageHeight + 11}
              width="12"
              height="3"
              rx="1.5"
              fill={thumbnail.brand}
            />
          </g>
        );
      })}
    </svg>
  );
}
