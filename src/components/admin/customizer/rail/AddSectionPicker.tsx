'use client';

/**
 * The "add section" picker.
 *
 * Every entry is generated from `SECTION_LIST`, including the label, icon,
 * description and the instance cap. A type at its cap is shown disabled with
 * the reason, rather than hidden — a merchant wondering where the hero went is
 * a worse outcome than one being told they already have two.
 */

import * as React from 'react';
import { IconPlus } from '@tabler/icons-react';

import { Modal } from '@/components/ui';
import { SECTION_LIST, type Section, type SectionType } from '@/lib/storefront-theme';

import { SectionIcon } from '../SectionIcon';
import { canAddSection, countOfType } from '../state/reducer';
import styles from '../Customizer.module.css';

export interface AddSectionPickerProps {
  opened: boolean;
  onClose: () => void;
  sections: Section[];
  /**
   * Add a section of this type.
   * @param type - The chosen section type
   */
  onAdd: (type: SectionType) => void;
}

/**
 * A modal gallery of every section type the storefront can render.
 * @param props - {@link AddSectionPickerProps}
 * @returns The picker dialog
 */
export function AddSectionPicker({
  opened,
  onClose,
  sections,
  onAdd,
}: AddSectionPickerProps): React.ReactElement {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      title="Add a section"
      description="Sections stack down your home page. You can reorder, hide or remove any of them afterwards."
    >
      <div className={styles.pickerGrid}>
        {SECTION_LIST.map((definition) => {
          const allowed = canAddSection(sections, definition.type);
          const used = countOfType(sections, definition.type);
          return (
            <button
              key={definition.type}
              type="button"
              className={styles.pickerCard}
              disabled={!allowed}
              onClick={() => {
                onAdd(definition.type);
                onClose();
              }}
            >
              <span className={styles.pickerIcon}>
                <SectionIcon name={definition.icon} size={18} aria-hidden="true" />
              </span>
              <span className={styles.pickerBody}>
                <span className={styles.pickerTitle}>{definition.label}</span>
                <span className={styles.pickerDesc}>{definition.description}</span>
                {allowed ? (
                  used > 0 ? (
                    <span className={styles.pickerLimit}>
                      {used} of {definition.maxPerPage} used
                    </span>
                  ) : null
                ) : (
                  <span className={styles.pickerLimit}>
                    Limit reached — {definition.maxPerPage} per page
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

export interface AddSectionButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

/**
 * The row that opens the picker.
 * @param props - {@link AddSectionButtonProps}
 * @returns A full-width add button
 */
export function AddSectionButton({ onClick, disabled }: AddSectionButtonProps): React.ReactElement {
  return (
    <button type="button" className={styles.navRow} onClick={onClick} disabled={disabled}>
      <span className={styles.navRowIcon}>
        <IconPlus size={16} aria-hidden="true" />
      </span>
      <span className={styles.navRowText}>
        <span className={styles.navRowTitle}>Add section</span>
        <span className={styles.navRowSub}>
          {disabled ? 'This page is full' : 'Hero, products, testimonials, FAQ and more'}
        </span>
      </span>
    </button>
  );
}
