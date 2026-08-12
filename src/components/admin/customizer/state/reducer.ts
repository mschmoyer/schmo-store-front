/**
 * The customizer's working-draft reducer.
 *
 * Pure by construction: no clock, no randomness, no I/O. Every action that
 * needs a timestamp carries one (`at`), and new section ids are derived from
 * the existing list rather than from `Math.random`, so the whole editing model
 * — including undo/redo and drag-to-reorder — is unit-testable without a DOM.
 *
 * Section creation, instance caps and defaults all come from the engine's
 * `SECTION_REGISTRY`; nothing about a specific section type is encoded here.
 */

import {
  MAX_SECTIONS_PER_PAGE,
  createSection,
  getSectionDefinition,
  type Section,
  type SectionType,
} from '@/lib/storefront-theme';

import type { CustomizerDoc, CustomizerState, RailTab, Selection } from './types';

/** How many undo steps to keep. Deep enough for a session, bounded for memory. */
export const HISTORY_LIMIT = 50;

/** Edits sharing a merge key within this window collapse into one undo step. */
export const COALESCE_WINDOW_MS = 700;

export type CustomizerAction =
  /** Replace everything from a server payload. Clears history. */
  | { type: 'hydrate'; doc: CustomizerDoc; published: CustomizerDoc | null }
  /** Set one dotted path on the theme patch, e.g. `brand.color`. */
  | { type: 'theme/set'; path: string; value: unknown; mergeKey?: string; at?: number }
  /** Fork from a preset, discarding theme overrides but keeping custom CSS. */
  | { type: 'theme/preset'; preset: string }
  | { type: 'sections/add'; sectionType: SectionType }
  | { type: 'sections/remove'; id: string }
  | { type: 'sections/duplicate'; id: string }
  | { type: 'sections/toggle'; id: string }
  | { type: 'sections/move'; from: number; to: number }
  | { type: 'sections/reorder'; ids: string[] }
  | {
      type: 'sections/setting';
      id: string;
      field: string;
      value: unknown;
      mergeKey?: string;
      at?: number;
    }
  | { type: 'select'; selection: Selection }
  | { type: 'tab'; tab: RailTab }
  | { type: 'undo' }
  | { type: 'redo' }
  /** Throw the draft away and go back to what the public storefront serves. */
  | { type: 'discard' }
  /** The server confirmed this document as the saved draft. */
  | { type: 'saved'; doc: CustomizerDoc }
  /** The server confirmed this document as the published theme. */
  | { type: 'published'; doc: CustomizerDoc };

/* ------------------------------------------------------------------ *
 * Small pure helpers
 * ------------------------------------------------------------------ */

/**
 * Structural equality via canonical JSON. Adequate here because both sides are
 * JSON documents that came from, or are destined for, a JSONB column.
 * @param a - First document
 * @param b - Second document
 * @returns True when the two serialise identically
 */
export function sameDoc(a: CustomizerDoc, b: CustomizerDoc): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Deep-clone a JSON document.
 * @param doc - Document to copy
 * @returns An independent copy
 */
export function cloneDoc(doc: CustomizerDoc): CustomizerDoc {
  return JSON.parse(JSON.stringify(doc)) as CustomizerDoc;
}

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Immutably set a dotted path inside a plain object.
 *
 * Setting a value to `undefined` removes the key, which is how a control
 * returns a field to "inherit from the preset" rather than pinning it.
 *
 * @param target - Source object; never mutated
 * @param path - Dotted path such as `brand.color` or `header.announcement.text`
 * @param value - Value to write, or undefined to delete the key
 * @returns A new object with the path applied
 */
export function setIn<T extends Record<string, unknown>>(
  target: T,
  path: string,
  value: unknown,
): T {
  const keys = path.split('.').filter(Boolean);
  if (keys.length === 0 || keys.some((key) => UNSAFE_KEYS.has(key))) return target;

  const [head, ...rest] = keys;
  const next: Record<string, unknown> = { ...target };

  if (rest.length === 0) {
    if (value === undefined) delete next[head];
    else next[head] = value;
    return next as T;
  }

  const current = next[head];
  const branch =
    typeof current === 'object' && current !== null && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : {};
  next[head] = setIn(branch, rest.join('.'), value);
  return next as T;
}

/**
 * Read a dotted path out of a plain object.
 * @param target - Source object
 * @param path - Dotted path
 * @returns The value, or undefined when any segment is missing
 */
export function getIn(target: unknown, path: string): unknown {
  return path.split('.').filter(Boolean).reduce<unknown>((acc, key) => {
    if (typeof acc !== 'object' || acc === null) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, target);
}

/**
 * Pick an unused id for a new section of a given type.
 *
 * Deterministic — the lowest free `type-n` — so tests, autosaves and the
 * preview all agree on what was just added.
 *
 * @param sections - The current list
 * @param type - The section type being created
 * @returns A suffix that makes `type-suffix` unique
 */
export function nextSectionSuffix(sections: Section[], type: SectionType): string {
  const taken = new Set(sections.map((section) => section.id));
  let n = 1;
  while (taken.has(`${type}-${n}`)) n += 1;
  return String(n);
}

/** A default deadline a week out, for a freshly added countdown. */
export const COUNTDOWN_DEFAULT_DAYS = 7;

/**
 * Fill in the defaults a static schema cannot express.
 *
 * `SettingField.default` is a constant, so a countdown could only ever ship
 * with an *empty* deadline — and because "hide when the timer runs out" is on
 * out of the box, that meant a section which was invisible from the moment it
 * was added, with nothing on screen saying why. A section you add and cannot
 * see is indistinguishable from one that is broken.
 *
 * A week out is a placeholder the merchant will obviously change, and it makes
 * the section render immediately so they can see what they are editing.
 *
 * @param section - A section straight out of `createSection`
 * @returns The same section, with any time-relative defaults filled in
 */
export function seedDynamicDefaults(section: Section): Section {
  if (section.type !== 'countdown') return section;
  if (typeof section.settings.endsAt === 'string' && section.settings.endsAt !== '') return section;

  const deadline = new Date(Date.now() + COUNTDOWN_DEFAULT_DAYS * 24 * 60 * 60 * 1000);
  deadline.setSeconds(0, 0);
  return { ...section, settings: { ...section.settings, endsAt: deadline.toISOString() } };
}

/**
 * How many of a type the list already holds.
 * @param sections - The current list
 * @param type - Section type
 * @returns Instance count
 */
export function countOfType(sections: Section[], type: SectionType): number {
  return sections.filter((section) => section.type === type).length;
}

/**
 * Whether another instance of a type may be added.
 *
 * Enforces both the per-type `maxPerPage` from the registry and the engine's
 * page-wide cap, so the "add section" picker can grey out what would be
 * rejected rather than failing after the click.
 *
 * @param sections - The current list
 * @param type - Section type
 * @returns True when one more instance is allowed
 */
export function canAddSection(sections: Section[], type: SectionType): boolean {
  const definition = getSectionDefinition(type);
  if (!definition) return false;
  if (sections.length >= MAX_SECTIONS_PER_PAGE) return false;
  return countOfType(sections, type) < definition.maxPerPage;
}

/**
 * Move an array item, returning a new array.
 * @param items - Source array
 * @param from - Current index
 * @param to - Target index
 * @returns A reordered copy, or the original when the indices are unusable
 */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to) return items;
  if (from < 0 || from >= items.length) return items;
  if (to < 0 || to >= items.length) return items;
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/* ------------------------------------------------------------------ *
 * State construction
 * ------------------------------------------------------------------ */

/**
 * Build the initial state for a freshly-loaded document.
 * @param doc - The draft the server returned
 * @param published - The live published document, when there is one
 * @returns A clean state with empty history
 */
export function initialState(
  doc: CustomizerDoc,
  published: CustomizerDoc | null = null,
): CustomizerState {
  return {
    present: doc,
    past: [],
    future: [],
    saved: doc,
    published,
    selection: { kind: 'root' },
    tab: 'sections',
    lastEdit: null,
  };
}

/**
 * Commit a new present, pushing the old one onto the undo stack.
 *
 * When the incoming edit shares a merge key with the previous one and lands
 * inside the coalescing window, the history entry is reused instead — one
 * slider drag is one undo step, not two hundred.
 *
 * @param state - Current state
 * @param present - The new document
 * @param mergeKey - Identifier of the control being edited
 * @param at - Client timestamp of the edit
 * @returns The next state
 */
function commit(
  state: CustomizerState,
  present: CustomizerDoc,
  mergeKey?: string,
  at?: number,
): CustomizerState {
  if (sameDoc(state.present, present)) return state;

  const coalesce =
    mergeKey !== undefined &&
    at !== undefined &&
    state.lastEdit !== null &&
    state.lastEdit.key === mergeKey &&
    at - state.lastEdit.at < COALESCE_WINDOW_MS;

  const past = coalesce
    ? state.past
    : [...state.past, state.present].slice(-HISTORY_LIMIT);

  return {
    ...state,
    present,
    past,
    future: [],
    lastEdit: mergeKey !== undefined && at !== undefined ? { key: mergeKey, at } : null,
  };
}

/**
 * Apply a change to the section list.
 * @param state - Current state
 * @param sections - The new list
 * @param mergeKey - Optional coalescing key
 * @param at - Optional client timestamp
 * @returns The next state
 */
function commitSections(
  state: CustomizerState,
  sections: Section[],
  mergeKey?: string,
  at?: number,
): CustomizerState {
  return commit(state, { ...state.present, sections }, mergeKey, at);
}

/* ------------------------------------------------------------------ *
 * Reducer
 * ------------------------------------------------------------------ */

/**
 * The customizer's single state transition function.
 * @param state - Current state
 * @param action - What happened
 * @returns The next state
 */
export function customizerReducer(
  state: CustomizerState,
  action: CustomizerAction,
): CustomizerState {
  switch (action.type) {
    case 'hydrate':
      return {
        ...initialState(action.doc, action.published),
        selection: state.selection,
        tab: state.tab,
      };

    case 'theme/set': {
      const theme = setIn(
        state.present.theme as Record<string, unknown>,
        action.path,
        action.value,
      );
      return commit(
        state,
        { ...state.present, theme },
        action.mergeKey ?? `theme:${action.path}`,
        action.at,
      );
    }

    case 'theme/preset': {
      // Forking from a preset drops the merchant's theme overrides — that is
      // the point of the action — but keeps their hand-written CSS, which is
      // separate work and far more expensive to lose.
      const css = (state.present.theme.custom as { css?: string } | undefined)?.css;
      const theme = {
        version: 1 as const,
        preset: action.preset,
        ...(css ? { custom: { css } } : {}),
      };
      return commit(state, { ...state.present, theme });
    }

    case 'sections/add': {
      if (!canAddSection(state.present.sections, action.sectionType)) return state;
      const section = seedDynamicDefaults(
        createSection(
          action.sectionType,
          nextSectionSuffix(state.present.sections, action.sectionType),
        ),
      );
      const next = commitSections(state, [...state.present.sections, section]);
      return { ...next, selection: { kind: 'section', id: section.id }, tab: 'sections' };
    }

    case 'sections/remove': {
      const sections = state.present.sections.filter((section) => section.id !== action.id);
      if (sections.length === state.present.sections.length) return state;
      const next = commitSections(state, sections);
      const stillSelected =
        state.selection.kind === 'section' && state.selection.id === action.id;
      return stillSelected ? { ...next, selection: { kind: 'root' } } : next;
    }

    case 'sections/duplicate': {
      const index = state.present.sections.findIndex((section) => section.id === action.id);
      if (index === -1) return state;
      const source = state.present.sections[index];
      if (!canAddSection(state.present.sections, source.type)) return state;

      const copy: Section = {
        ...source,
        id: `${source.type}-${nextSectionSuffix(state.present.sections, source.type)}`,
        settings: JSON.parse(JSON.stringify(source.settings)) as Record<string, unknown>,
      };
      const sections = state.present.sections.slice();
      sections.splice(index + 1, 0, copy);
      const next = commitSections(state, sections);
      return { ...next, selection: { kind: 'section', id: copy.id }, tab: 'sections' };
    }

    case 'sections/toggle': {
      const sections = state.present.sections.map((section) =>
        section.id === action.id ? { ...section, enabled: !section.enabled } : section,
      );
      return commitSections(state, sections);
    }

    case 'sections/move':
      return commitSections(state, moveItem(state.present.sections, action.from, action.to));

    case 'sections/reorder': {
      const byId = new Map(state.present.sections.map((section) => [section.id, section]));
      const ordered: Section[] = [];
      for (const id of action.ids) {
        const section = byId.get(id);
        if (section) {
          ordered.push(section);
          byId.delete(id);
        }
      }
      // Anything the caller forgot to mention keeps its relative position at
      // the end rather than silently vanishing.
      for (const section of state.present.sections) {
        if (byId.has(section.id)) ordered.push(section);
      }
      return commitSections(state, ordered);
    }

    case 'sections/setting': {
      const sections = state.present.sections.map((section) =>
        section.id === action.id
          ? { ...section, settings: { ...section.settings, [action.field]: action.value } }
          : section,
      );
      return commitSections(
        state,
        sections,
        action.mergeKey ?? `section:${action.id}:${action.field}`,
        action.at,
      );
    }

    case 'select':
      return { ...state, selection: action.selection };

    case 'tab':
      return { ...state, tab: action.tab, selection: { kind: 'root' } };

    case 'undo': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        ...state,
        present: previous,
        past: state.past.slice(0, -1),
        future: [state.present, ...state.future].slice(0, HISTORY_LIMIT),
        lastEdit: null,
      };
    }

    case 'redo': {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return {
        ...state,
        present: next,
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        future: rest,
        lastEdit: null,
      };
    }

    case 'discard': {
      const target = state.published ?? state.saved;
      return commit({ ...state, selection: { kind: 'root' } }, cloneDoc(target));
    }

    case 'saved':
      return { ...state, saved: action.doc };

    case 'published':
      return { ...state, saved: action.doc, published: action.doc };

    default:
      return state;
  }
}

/* ------------------------------------------------------------------ *
 * Derived flags
 * ------------------------------------------------------------------ */

/** True when the merchant has edits the server has not accepted yet. */
export const hasUnsavedEdits = (state: CustomizerState): boolean =>
  !sameDoc(state.present, state.saved);

/** True when the draft differs from what the public storefront is serving. */
export const hasUnpublishedChanges = (state: CustomizerState): boolean =>
  state.published === null || !sameDoc(state.present, state.published);

/** True when there is anything to undo. */
export const canUndo = (state: CustomizerState): boolean => state.past.length > 0;

/** True when there is anything to redo. */
export const canRedo = (state: CustomizerState): boolean => state.future.length > 0;
