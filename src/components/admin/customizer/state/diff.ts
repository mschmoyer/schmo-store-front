/**
 * A human-readable diff between two customizer documents.
 *
 * Used by the publish confirmation: "publish" is irreversible from the
 * merchant's point of view, so they get told in plain words what is about to
 * change on their live shop rather than a version number.
 *
 * Labels come from the engine's own registries wherever one exists (section
 * labels, font labels, preset names), so a new section type or font shows up
 * here correctly with no change to this file.
 */

import {
  FONTS,
  PRESETS,
  getSectionDefinition,
  type Section,
  type StorefrontThemeInput,
} from '@/lib/storefront-theme';

import { getIn } from './reducer';
import type { CustomizerDoc } from './types';

export interface DiffEntry {
  /** Grouping shown as a small heading in the dialog. */
  group: 'Theme' | 'Sections' | 'Custom CSS';
  /** One line of plain English. */
  label: string;
  /** Optional before/after, rendered as two swatches or two chips. */
  from?: string;
  to?: string;
  /** Set when `from`/`to` are hex colors so the dialog can draw swatches. */
  kind?: 'color' | 'text';
}

/** Theme paths worth naming, in the order a merchant thinks about them. */
const THEME_FIELDS: Array<{ path: string; label: string; kind?: 'color' }> = [
  { path: 'preset', label: 'Preset' },
  { path: 'brand.color', label: 'Brand colour', kind: 'color' },
  { path: 'brand.surface', label: 'Page background', kind: 'color' },
  { path: 'brand.surfaceRaised', label: 'Card background', kind: 'color' },
  { path: 'brand.text', label: 'Text colour', kind: 'color' },
  { path: 'brand.textMuted', label: 'Muted text colour', kind: 'color' },
  { path: 'brand.border', label: 'Border colour', kind: 'color' },
  { path: 'brand.success', label: 'Success colour', kind: 'color' },
  { path: 'brand.warning', label: 'Warning colour', kind: 'color' },
  { path: 'brand.danger', label: 'Error colour', kind: 'color' },
  { path: 'brand.scheme', label: 'Colour scheme' },
  { path: 'typography.headingFont', label: 'Heading font' },
  { path: 'typography.bodyFont', label: 'Body font' },
  { path: 'typography.scale', label: 'Type scale' },
  { path: 'typography.headingWeight', label: 'Heading weight' },
  { path: 'typography.headingCase', label: 'Heading case' },
  { path: 'typography.headingTracking', label: 'Heading tracking' },
  { path: 'shape.radius', label: 'Corner radius' },
  { path: 'shape.borderWidth', label: 'Border width' },
  { path: 'shape.shadow', label: 'Shadow' },
  { path: 'shape.density', label: 'Density' },
  { path: 'buttons.style', label: 'Button style' },
  { path: 'buttons.uppercase', label: 'Uppercase buttons' },
  { path: 'productCard.imageRatio', label: 'Product image shape' },
  { path: 'productCard.imageFit', label: 'Product image fit' },
  { path: 'productCard.align', label: 'Product card alignment' },
  { path: 'productCard.showVendor', label: 'Show vendor on cards' },
  { path: 'productCard.showQuickAdd', label: 'Quick add button' },
  { path: 'productCard.hoverEffect', label: 'Card hover effect' },
  { path: 'header.layout', label: 'Header layout' },
  { path: 'header.sticky', label: 'Sticky header' },
  { path: 'header.announcement.enabled', label: 'Announcement bar' },
  { path: 'header.announcement.text', label: 'Announcement text' },
  { path: 'header.announcement.href', label: 'Announcement link' },
  { path: 'footer.layout', label: 'Footer layout' },
  { path: 'footer.showNewsletter', label: 'Footer newsletter' },
];

/**
 * Render a theme value as something a merchant would recognise.
 * @param path - The dotted theme path the value came from
 * @param value - The raw value
 * @returns A display string
 */
function displayValue(path: string, value: unknown): string {
  if (value === undefined || value === null || value === '') return 'not set';
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  if (path === 'preset') {
    return PRESETS[String(value)]?.name ?? String(value);
  }
  if (path.endsWith('Font')) {
    return FONTS[value as keyof typeof FONTS]?.label ?? String(value);
  }
  return String(value);
}

/**
 * Diff the theme halves of two documents.
 * @param before - The published theme patch
 * @param after - The draft theme patch
 * @returns One entry per named field that changed
 */
function diffTheme(before: StorefrontThemeInput, after: StorefrontThemeInput): DiffEntry[] {
  const entries: DiffEntry[] = [];
  for (const field of THEME_FIELDS) {
    const from = getIn(before, field.path);
    const to = getIn(after, field.path);
    if (JSON.stringify(from) === JSON.stringify(to)) continue;
    entries.push({
      group: 'Theme',
      label: field.label,
      from: displayValue(field.path, from),
      to: displayValue(field.path, to),
      kind: field.kind === 'color' ? 'color' : 'text',
    });
  }
  return entries;
}

/**
 * Label a section for the diff list.
 * @param section - The section
 * @returns Its registry label, falling back to its type
 */
function sectionLabel(section: Section): string {
  return getSectionDefinition(section.type)?.label ?? section.type;
}

/**
 * Diff the section halves of two documents.
 * @param before - The published section list
 * @param after - The draft section list
 * @returns Entries for additions, removals, edits, reorders and visibility flips
 */
function diffSections(before: Section[], after: Section[]): DiffEntry[] {
  const entries: DiffEntry[] = [];
  const beforeById = new Map(before.map((section) => [section.id, section]));
  const afterById = new Map(after.map((section) => [section.id, section]));

  for (const section of after) {
    const previous = beforeById.get(section.id);
    if (!previous) {
      entries.push({ group: 'Sections', label: `Added "${sectionLabel(section)}"` });
      continue;
    }
    if (previous.enabled !== section.enabled) {
      entries.push({
        group: 'Sections',
        label: `${section.enabled ? 'Showed' : 'Hid'} "${sectionLabel(section)}"`,
      });
    }
    if (JSON.stringify(previous.settings) !== JSON.stringify(section.settings)) {
      entries.push({ group: 'Sections', label: `Edited "${sectionLabel(section)}"` });
    }
  }

  for (const section of before) {
    if (!afterById.has(section.id)) {
      entries.push({ group: 'Sections', label: `Removed "${sectionLabel(section)}"` });
    }
  }

  // Report a reorder only when the sections common to both lists changed their
  // relative order — otherwise every add or remove would also read as a reorder.
  const commonBefore = before.filter((s) => afterById.has(s.id)).map((s) => s.id);
  const commonAfter = after.filter((s) => beforeById.has(s.id)).map((s) => s.id);
  if (commonBefore.join('|') !== commonAfter.join('|')) {
    entries.push({ group: 'Sections', label: 'Reordered the home page' });
  }

  return entries;
}

/**
 * Diff two customizer documents into a list a merchant can read.
 * @param before - What the live storefront currently serves
 * @param after - What publishing would make live
 * @returns Every change worth mentioning, grouped
 */
export function diffDocs(before: CustomizerDoc | null, after: CustomizerDoc): DiffEntry[] {
  if (!before) {
    return [{ group: 'Theme', label: 'Publishing this storefront for the first time.' }];
  }

  const entries = [
    ...diffTheme(before.theme, after.theme),
    ...diffSections(before.sections, after.sections),
  ];

  const cssBefore = (before.theme.custom?.css ?? '').trim();
  const cssAfter = (after.theme.custom?.css ?? '').trim();
  if (cssBefore !== cssAfter) {
    entries.push({
      group: 'Custom CSS',
      label:
        cssAfter.length === 0
          ? 'Removed your custom CSS'
          : cssBefore.length === 0
            ? `Added ${cssAfter.length} characters of custom CSS`
            : `Changed your custom CSS (${cssBefore.length} → ${cssAfter.length} characters)`,
    });
  }

  return entries;
}
