/**
 * Keyboard reordering.
 *
 * The rail's grip tells every merchant, in its accessible name, to "hold alt
 * and press the up and down arrows". That handler existed and never ran: it was
 * declared before `{...listeners}` was spread onto the same button, and
 * dnd-kit's own `onKeyDown` inside `listeners` overwrote it. Nothing caught it,
 * because the handler was still present in the source and still bound to a
 * prop — just not the winning one.
 *
 * So these tests do what the review did: press the keys and assert the list
 * actually moved.
 */

import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { createSection, type Section } from '@/lib/storefront-theme';

import { SectionList } from '../rail/SectionList';

/** Four sections, in a known order. */
function fixture(): Section[] {
  return [
    createSection('hero', '1'),
    createSection('value-props', '1'),
    createSection('featured-collection', '1'),
    createSection('newsletter', '1'),
  ];
}

interface Harness {
  moves: Array<[number, number]>;
  order: () => string[];
}

/**
 * Render the list with a live order, so a move is observable in the DOM rather
 * than only in a spy.
 *
 * @param sections - Starting order
 * @returns The recorded moves and a reader for the rendered order
 */
function renderList(sections: Section[] = fixture()): Harness {
  const moves: Array<[number, number]> = [];

  function Harnessed(): React.ReactElement {
    const [list, setList] = React.useState(sections);
    return (
      <SectionList
        sections={list}
        selectedId={null}
        onSelect={() => {}}
        onReorder={() => {}}
        onMove={(from, to) => {
          moves.push([from, to]);
          setList((current) => {
            const next = current.slice();
            next.splice(to, 0, next.splice(from, 1)[0]);
            return next;
          });
        }}
        onToggle={() => {}}
        onDuplicate={() => {}}
        onRemove={() => {}}
        canDuplicate={() => true}
      />
    );
  }

  render(<Harnessed />);

  return {
    moves,
    order: () =>
      Array.from(document.querySelectorAll('[data-section-row]')).map(
        (row) => row.getAttribute('data-section-row') ?? '',
      ),
  };
}

/** The grip for a section, by id. */
const grip = (id: string): HTMLElement =>
  document.querySelector(`[data-section-grip="${id}"]`) as HTMLElement;

describe('Alt+Arrow reorder', () => {
  it('moves a section down, and the list really changes', () => {
    const harness = renderList();
    expect(harness.order()).toEqual([
      'hero-1',
      'value-props-1',
      'featured-collection-1',
      'newsletter-1',
    ]);

    fireEvent.keyDown(grip('hero-1'), { key: 'ArrowDown', altKey: true });

    expect(harness.moves).toEqual([[0, 1]]);
    expect(harness.order()).toEqual([
      'value-props-1',
      'hero-1',
      'featured-collection-1',
      'newsletter-1',
    ]);
  });

  it('moves a section up', () => {
    const harness = renderList();
    fireEvent.keyDown(grip('featured-collection-1'), { key: 'ArrowUp', altKey: true });

    expect(harness.moves).toEqual([[2, 1]]);
    expect(harness.order()).toEqual([
      'hero-1',
      'featured-collection-1',
      'value-props-1',
      'newsletter-1',
    ]);
  });

  it('walks a section from the top to the bottom, one press at a time', () => {
    const harness = renderList();
    for (let step = 0; step < 3; step += 1) {
      fireEvent.keyDown(grip('hero-1'), { key: 'ArrowDown', altKey: true });
    }
    expect(harness.order()).toEqual([
      'value-props-1',
      'featured-collection-1',
      'newsletter-1',
      'hero-1',
    ]);
  });

  it('does nothing at the ends of the list', () => {
    const harness = renderList();
    fireEvent.keyDown(grip('hero-1'), { key: 'ArrowUp', altKey: true });
    fireEvent.keyDown(grip('newsletter-1'), { key: 'ArrowDown', altKey: true });
    expect(harness.moves).toEqual([]);
    expect(harness.order()).toEqual([
      'hero-1',
      'value-props-1',
      'featured-collection-1',
      'newsletter-1',
    ]);
  });

  it('leaves a plain arrow alone, so dnd-kit keeps its lift/move/drop', () => {
    const harness = renderList();
    fireEvent.keyDown(grip('hero-1'), { key: 'ArrowDown' });
    expect(harness.moves).toEqual([]);
  });

  it('leaves other keys alone', () => {
    const harness = renderList();
    fireEvent.keyDown(grip('hero-1'), { key: 'a', altKey: true });
    fireEvent.keyDown(grip('hero-1'), { key: 'Escape', altKey: true });
    expect(harness.moves).toEqual([]);
  });
});

describe('the grip’s accessible name', () => {
  it('describes both keyboard paths, and both of them work', () => {
    renderList();
    const label = grip('hero-1').getAttribute('aria-label');
    expect(label).toBe(
      'Reorder Hero. Position 1 of 4. Press space to lift, or hold alt and press the up and down arrows.',
    );
  });

  it('renumbers after a move, so the announcement stays true', () => {
    renderList();
    fireEvent.keyDown(grip('hero-1'), { key: 'ArrowDown', altKey: true });
    expect(grip('hero-1').getAttribute('aria-label')).toContain('Position 2 of 4');
    expect(grip('value-props-1').getAttribute('aria-label')).toContain('Position 1 of 4');
  });

  it('names sections rather than ids', () => {
    renderList();
    expect(screen.getByLabelText(/^Reorder Value props\./)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Reorder value-props-1/)).not.toBeInTheDocument();
  });
});
