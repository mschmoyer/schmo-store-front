'use client';

/**
 * The ordered home-page section list.
 *
 * Reordering works three ways, and all three drive the same reducer action:
 *
 *  - pointer drag on the grip;
 *  - `@dnd-kit`'s keyboard sensor — focus the grip, Space to lift, arrows to
 *    move, Space to drop, Escape to cancel;
 *  - Alt+ArrowUp / Alt+ArrowDown on the grip for a direct one-step move, which
 *    is faster than a lift-move-drop cycle and works for anyone who finds modal
 *    drag interactions hard to hold in their head.
 *
 * Keyboard reordering is a requirement, not a nicety: a section list you can
 * only reorder with a mouse is inaccessible.
 */

import * as React from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  IconCopy,
  IconEye,
  IconEyeOff,
  IconGripVertical,
  IconTrash,
} from '@tabler/icons-react';

import { getSectionDefinition, type Section } from '@/lib/storefront-theme';

import { SectionIcon } from '../SectionIcon';
import styles from '../Customizer.module.css';

export interface SectionListProps {
  sections: Section[];
  selectedId: string | null;
  /**
   * Open a section's settings panel.
   * @param id - Section id
   */
  onSelect: (id: string) => void;
  /**
   * Commit a new order.
   * @param ids - Section ids, in their new order
   */
  onReorder: (ids: string[]) => void;
  /**
   * Move one section by one place.
   * @param from - Current index
   * @param to - Target index
   */
  onMove: (from: number, to: number) => void;
  onToggle: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  /**
   * Whether another copy of this section's type is allowed.
   * @param section - The section being duplicated
   */
  canDuplicate: (section: Section) => boolean;
}

interface SectionRowProps {
  section: Section;
  index: number;
  total: number;
  selected: boolean;
  onSelect: () => void;
  onMove: (from: number, to: number) => void;
  onToggle: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  canDuplicate: boolean;
}

/**
 * One draggable row.
 * @param props - {@link SectionRowProps}
 * @returns A list item
 */
function SortableSectionRow({
  section,
  index,
  total,
  selected,
  onSelect,
  onMove,
  onToggle,
  onDuplicate,
  onRemove,
  canDuplicate,
}: SectionRowProps): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });
  const definition = getSectionDefinition(section.type);
  const label = definition?.label ?? section.type;

  /**
   * Alt+arrow moves the row one place without entering drag mode.
   * @param event - The keyboard event on the grip
   */
  const onHandleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (!event.altKey) return;
    if (event.key === 'ArrowUp' && index > 0) {
      event.preventDefault();
      event.stopPropagation();
      onMove(index, index - 1);
    } else if (event.key === 'ArrowDown' && index < total - 1) {
      event.preventDefault();
      event.stopPropagation();
      onMove(index, index + 1);
    }
  };

  return (
    <li
      ref={setNodeRef}
      // Zeroing x keeps the drag on the vertical axis without needing
      // `@dnd-kit/modifiers`, which is not a dependency of this project.
      style={{
        transform: CSS.Transform.toString(transform ? { ...transform, x: 0 } : null),
        transition,
      }}
      className={[
        styles.sectionRow,
        selected ? styles.sectionRowSelected : '',
        section.enabled ? '' : styles.sectionRowDisabled,
        isDragging ? styles.sectionRowDragging : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-section-row={section.id}
    >
      <button
        type="button"
        className={styles.dragHandle}
        aria-label={`Reorder ${label}. Position ${index + 1} of ${total}. Press space to lift, or hold alt and press the up and down arrows.`}
        onKeyDown={onHandleKeyDown}
        {...attributes}
        {...listeners}
      >
        <IconGripVertical size={16} aria-hidden="true" />
      </button>

      <button
        type="button"
        className={styles.sectionOpen}
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
      >
        <SectionIcon
          name={definition?.icon ?? ''}
          size={16}
          className={styles.sectionIcon}
          aria-hidden="true"
        />
        <span className={styles.sectionRowTitle}>{label}</span>
      </button>

      <span className={styles.rowActions}>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={section.enabled ? `Hide ${label}` : `Show ${label}`}
          title={section.enabled ? 'Hide on the storefront' : 'Show on the storefront'}
          onClick={onToggle}
        >
          {section.enabled ? (
            <IconEye size={15} aria-hidden="true" />
          ) : (
            <IconEyeOff size={15} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={`Duplicate ${label}`}
          title={canDuplicate ? 'Duplicate' : `You have the maximum number of ${label} sections`}
          disabled={!canDuplicate}
          onClick={onDuplicate}
        >
          <IconCopy size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`${styles.iconButton} ${styles.iconButtonDanger}`}
          aria-label={`Remove ${label}`}
          title="Remove"
          onClick={onRemove}
        >
          <IconTrash size={15} aria-hidden="true" />
        </button>
      </span>
    </li>
  );
}

/**
 * The sortable section list.
 * @param props - {@link SectionListProps}
 * @returns An ordered, reorderable list
 */
export function SectionList({
  sections,
  selectedId,
  onSelect,
  onReorder,
  onMove,
  onToggle,
  onDuplicate,
  onRemove,
  canDuplicate,
}: SectionListProps): React.ReactElement {
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const sensors = useSensors(
    // A small distance threshold keeps a click on the grip from being read as
    // a drag, so the button's own keyboard handlers still work.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = sections.map((section) => section.id);

  /**
   * Note which row is in flight so the placeholder can dim.
   * @param event - dnd-kit drag start
   */
  const handleDragStart = (event: DragStartEvent): void => {
    setActiveId(String(event.active.id));
  };

  /**
   * Commit the new order.
   * @param event - dnd-kit drag end
   */
  const handleDragEnd = (event: DragEndEvent): void => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    const next = ids.slice();
    next.splice(to, 0, next.splice(from, 1)[0]);
    onReorder(next);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className={styles.sectionList} aria-label="Home page sections" data-dragging={activeId ?? undefined}>
          {sections.map((section, index) => (
            <SortableSectionRow
              key={section.id}
              section={section}
              index={index}
              total={sections.length}
              selected={section.id === selectedId}
              canDuplicate={canDuplicate(section)}
              onSelect={() => onSelect(section.id)}
              onMove={onMove}
              onToggle={() => onToggle(section.id)}
              onDuplicate={() => onDuplicate(section.id)}
              onRemove={() => onRemove(section.id)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
