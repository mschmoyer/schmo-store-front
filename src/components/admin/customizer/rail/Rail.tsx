'use client';

/**
 * The settings rail.
 *
 * Deliberately a **drill-down**, not one long scroll. The root of each tab is a
 * short, scannable list; opening a section or a theme group replaces the rail's
 * contents and offers a back link. That keeps every panel to roughly a screen,
 * keeps the merchant oriented, and means a store with twenty sections is still
 * navigable.
 *
 * The rail owns its own scroll context, so scrolling it never moves the page or
 * the preview behind it.
 */

import * as React from 'react';
import { IconChevronLeft, IconChevronRight, IconRefresh } from '@tabler/icons-react';

import { Badge, Button } from '@/components/ui';
import {
  getSectionDefinition,
  type FontId,
  type Section,
  type StorefrontThemeInput,
} from '@/lib/storefront-theme';

import type { ContrastFinding } from '../contrast/findings';
import { findingsForPath } from '../contrast/findings';
import { ContrastNoticeList } from '../controls/ContrastNotice';
import type { RailTab, Selection, ThemeGroupId } from '../state/types';
import { AddSectionButton } from './AddSectionPicker';
import { CustomCssPanel } from './CustomCssPanel';
import { FontPicker } from './FontPicker';
import { PresetPanel } from './PresetPanel';
import { SectionList } from './SectionList';
import { SectionSettingsPanel } from './SectionSettingsPanel';
import { THEME_GROUPS } from './themeSchema';
import { ThemeFieldsPanel } from './ThemeFieldsPanel';
import { ThemeGroupIcon } from './ThemeGroupIcon';
import styles from '../Customizer.module.css';

export interface RailProps {
  tab: RailTab;
  onTabChange: (tab: RailTab) => void;
  selection: Selection;
  onSelect: (selection: Selection) => void;

  sections: Section[];
  theme: StorefrontThemeInput;
  /** The theme with defaults and preset merged in, for showing effective values. */
  resolved: Record<string, unknown>;
  storeId: string;

  onThemeChange: (path: string, value: unknown) => void;
  onSectionSetting: (id: string, fieldId: string, value: unknown) => void;
  onReorder: (ids: string[]) => void;
  onMove: (from: number, to: number) => void;
  onToggleSection: (id: string) => void;
  onDuplicateSection: (id: string) => void;
  onRemoveSection: (id: string) => void;
  onAddSection: () => void;
  onChoosePreset: (presetId: string) => void;
  onResetToPreset: () => void;
  canAddAnySection: boolean;
  canDuplicate: (section: Section) => boolean;

  findings: ContrastFinding[];
  onApplyFix: (fix: { path: string; value: string }) => void;

  /** Brings the storefront font variables into scope for the font previews only. */
  fontScopeClassName?: string;
}

/**
 * A row that opens a sub-panel.
 * @param props - Row content and click handler
 * @returns A navigation row
 */
function NavRow({
  icon,
  title,
  subtitle,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button type="button" className={styles.navRow} onClick={onClick}>
      <span className={styles.navRowIcon}>{icon}</span>
      <span className={styles.navRowText}>
        <span className={styles.navRowTitle}>{title}</span>
        <span className={styles.navRowSub}>{subtitle}</span>
      </span>
      {badge}
      <IconChevronRight size={15} className={styles.navRowChevron} aria-hidden="true" />
    </button>
  );
}

/**
 * The customizer's settings rail.
 * @param props - {@link RailProps}
 * @returns The rail
 */
export function Rail(props: RailProps): React.ReactElement {
  const {
    tab,
    onTabChange,
    selection,
    onSelect,
    sections,
    theme,
    resolved,
    storeId,
    onThemeChange,
    onSectionSetting,
    onReorder,
    onMove,
    onToggleSection,
    onDuplicateSection,
    onRemoveSection,
    onAddSection,
    onChoosePreset,
    onResetToPreset,
    canAddAnySection,
    canDuplicate,
    findings,
    onApplyFix,
    fontScopeClassName,
  } = props;

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const selectedSectionId = selection.kind === 'section' ? selection.id : null;

  // A click in the preview selects a section; bring it into view here too, so
  // the two halves of the tool always agree about what is being edited.
  React.useEffect(() => {
    if (!selectedSectionId) return;
    const node = scrollRef.current?.querySelector(`[data-section-row="${CSS.escape(selectedSectionId)}"]`);
    node?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedSectionId]);

  // Every panel starts at the top; keeping the previous scroll offset when the
  // contents change entirely is disorienting.
  const panelKey =
    selection.kind === 'section'
      ? `section:${selection.id}`
      : selection.kind === 'theme'
        ? `theme:${selection.group}`
        : `root:${tab}`;

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [panelKey]);

  const failureCount = findings.filter((finding) => finding.level === 'fail').length;
  const adjustedCount = findings.filter((finding) => finding.level === 'adjusted').length;

  /**
   * Count the findings that belong to a theme group, for its rail badge.
   * @param groupId - The group
   * @returns How many findings that group holds
   */
  const findingsInGroup = (groupId: ThemeGroupId): number => {
    const group = THEME_GROUPS.find((entry) => entry.id === groupId);
    if (!group) return 0;
    return group.fields.reduce(
      (total, descriptor) => total + findingsForPath(findings, descriptor.path).length,
      0,
    );
  };

  const selectedSection =
    selection.kind === 'section'
      ? (sections.find((section) => section.id === selection.id) ?? null)
      : null;

  const currentPreset = typeof theme.preset === 'string' ? theme.preset : 'studio';
  const hasOverrides = Object.keys(theme).some(
    (key) => key !== 'preset' && key !== 'version' && key !== 'custom',
  );

  /* ---------------- Drill-down panels ---------------- */

  if (selectedSection) {
    const definition = getSectionDefinition(selectedSection.type);
    return (
      <aside className={styles.rail} aria-label="Section settings">
        <div className={styles.railScroll} ref={scrollRef}>
          <div className={styles.railHeader}>
            <button
              type="button"
              className={styles.railBack}
              onClick={() => onSelect({ kind: 'root' })}
            >
              <IconChevronLeft size={16} aria-hidden="true" />
              Sections
            </button>
            <span className={styles.railTitle}>{definition?.label ?? selectedSection.type}</span>
          </div>

          <SectionSettingsPanel
            section={selectedSection}
            canDuplicate={canDuplicate(selectedSection)}
            onChange={(fieldId, value) => onSectionSetting(selectedSection.id, fieldId, value)}
            onToggle={() => onToggleSection(selectedSection.id)}
            onDuplicate={() => onDuplicateSection(selectedSection.id)}
            onRemove={() => onRemoveSection(selectedSection.id)}
          />
        </div>
      </aside>
    );
  }

  if (selection.kind === 'theme') {
    const group = THEME_GROUPS.find((entry) => entry.id === selection.group);
    return (
      <aside className={styles.rail} aria-label={`${group?.label ?? 'Theme'} settings`}>
        <div className={styles.railScroll} ref={scrollRef}>
          <div className={styles.railHeader}>
            <button
              type="button"
              className={styles.railBack}
              onClick={() => onSelect({ kind: 'root' })}
            >
              <IconChevronLeft size={16} aria-hidden="true" />
              Theme
            </button>
            <span className={styles.railTitle}>{group?.label}</span>
          </div>

          {selection.group === 'presets' ? (
            <PresetPanel
              currentPreset={currentPreset}
              hasOverrides={hasOverrides}
              onChoose={onChoosePreset}
            />
          ) : selection.group === 'custom-css' ? (
            <CustomCssPanel
              storeId={storeId}
              value={theme.custom?.css ?? ''}
              onChange={(css) => onThemeChange('custom.css', css)}
            />
          ) : selection.group === 'typography' ? (
            <>
              <div className={styles.railGroup}>
                <FontPicker
                  label="Heading font"
                  value={(resolved.typography as { headingFont: FontId }).headingFont}
                  fontScopeClassName={fontScopeClassName}
                  onChange={(id) => onThemeChange('typography.headingFont', id)}
                />
              </div>
              <div className={styles.railGroup}>
                <FontPicker
                  label="Body font"
                  value={(resolved.typography as { bodyFont: FontId }).bodyFont}
                  fontScopeClassName={fontScopeClassName}
                  onChange={(id) => onThemeChange('typography.bodyFont', id)}
                />
              </div>
              <div className={styles.railGroup}>
                <ThemeFieldsPanel
                  fields={group?.fields ?? []}
                  theme={theme as Record<string, unknown>}
                  resolved={resolved}
                  onChange={onThemeChange}
                  findings={findings}
                  onApplyFix={onApplyFix}
                />
              </div>
            </>
          ) : (
            <div className={styles.railGroup}>
              <ThemeFieldsPanel
                fields={group?.fields ?? []}
                theme={theme as Record<string, unknown>}
                resolved={resolved}
                onChange={onThemeChange}
                findings={findings}
                onApplyFix={onApplyFix}
              />
            </div>
          )}
        </div>
      </aside>
    );
  }

  /* ---------------- Roots ---------------- */

  return (
    <aside className={styles.rail} aria-label="Customizer settings">
      <div className={styles.railTabs} role="tablist" aria-label="Customizer areas">
        <button
          type="button"
          role="tab"
          className={styles.railTab}
          aria-selected={tab === 'sections'}
          onClick={() => onTabChange('sections')}
        >
          Sections
        </button>
        <button
          type="button"
          role="tab"
          className={styles.railTab}
          aria-selected={tab === 'theme'}
          onClick={() => onTabChange('theme')}
        >
          Theme
        </button>
      </div>

      <div className={styles.railScroll} ref={scrollRef}>
        {tab === 'sections' ? (
          <>
            <div className={styles.railGroup}>
              <span className={styles.railLabel}>Home page</span>
              <p className={styles.railHint}>
                Drag to reorder, or focus a grip and hold alt with the arrow keys. Click a section
                in the preview to jump to it.
              </p>
            </div>

            <SectionList
              sections={sections}
              selectedId={selectedSectionId}
              canDuplicate={canDuplicate}
              onSelect={(id) => onSelect({ kind: 'section', id })}
              onReorder={onReorder}
              onMove={onMove}
              onToggle={onToggleSection}
              onDuplicate={onDuplicateSection}
              onRemove={onRemoveSection}
            />

            <div className={styles.navList}>
              <AddSectionButton onClick={onAddSection} disabled={!canAddAnySection} />
            </div>
          </>
        ) : (
          <>
            {failureCount > 0 || adjustedCount > 0 ? (
              <div className={styles.railGroup}>
                <ContrastNoticeList
                  findings={findings.filter((finding) => finding.level === 'fail').slice(0, 1)}
                  onApplyFix={onApplyFix}
                />
              </div>
            ) : null}

            <div className={styles.navList}>
              {THEME_GROUPS.map((group) => {
                const count = findingsInGroup(group.id);
                return (
                  <NavRow
                    key={group.id}
                    icon={<ThemeGroupIcon name={group.icon} size={16} aria-hidden="true" />}
                    title={group.label}
                    subtitle={group.description}
                    badge={
                      count > 0 ? (
                        <Badge tone="amber" size="sm">
                          {count}
                        </Badge>
                      ) : undefined
                    }
                    onClick={() => onSelect({ kind: 'theme', group: group.id })}
                  />
                );
              })}
            </div>

            <div className={styles.railGroup}>
              <span className={styles.railLabel}>Start over</span>
              <Button
                variant="secondary"
                size="sm"
                fullWidth
                leftIcon={<IconRefresh size={14} aria-hidden="true" />}
                onClick={onResetToPreset}
              >
                Reset to the {currentPreset} preset
              </Button>
              <span className={styles.railHint}>
                Puts the theme and every section back to how this preset ships.
              </span>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
