/**
 * The one number a merchant watches during a catalog import.
 *
 * The bar used to divide `imported` by `found`, where `found` counts only the
 * pages already fetched. After page one of a 5,000-product import both were
 * 100, so the bar read **100%** and then sat pinned there for another
 * forty-nine pages. This asserts that it now divides by the size of the
 * catalog, and that when ShipStation does not send one the bar goes
 * indeterminate rather than inventing a number.
 */

import * as React from 'react';
import { render, screen } from '@testing-library/react';

import ImportStep from '../../steps/ImportStep';
import { ANONYMOUS_STATE } from '../types';
import type { ImportProgress } from '../types';
import type { OnboardingApi } from '../../useOnboarding';

/** A connected merchant part-way through an import. */
function api(progress: Partial<ImportProgress>): OnboardingApi {
  return {
    state: {
      ...ANONYMOUS_STATE,
      authenticated: true,
      currentStep: 'import',
      // These tests are about the progress UI, which only renders once the
      // catalogue key exists — without it the step correctly shows the key form.
      shipstation: {
        ...ANONYMOUS_STATE.shipstation,
        connected: true,
        catalogKeyPresent: true,
      },
      importProgress: { ...ANONYMOUS_STATE.importProgress, ...progress },
    },
    loading: false,
    busy: false,
    error: null,
    clearError: () => {},
    submit: async () => null,
    navigate: async () => {},
    refresh: async () => {},
  };
}

/** The progress bar element. */
const bar = (): HTMLElement => screen.getByTestId('import-progress');

/** Its filled portion. */
const fill = (): HTMLElement => bar().firstElementChild as HTMLElement;

describe('the progress bar', () => {
  it('reads 2%, not 100%, after the first page of a 5,000 product catalog', () => {
    render(<ImportStep api={api({ status: 'running', found: 100, imported: 100, total: 5000 })} />);
    expect(bar()).toHaveAttribute('aria-valuenow', '2');
    expect(fill()).toHaveStyle({ width: '2%' });
  });

  it('climbs with the import', () => {
    render(<ImportStep api={api({ status: 'running', found: 2500, imported: 2500, total: 5000 })} />);
    expect(bar()).toHaveAttribute('aria-valuenow', '50');
  });

  it('counts failures towards progress, since they are pages already read', () => {
    render(
      <ImportStep
        api={api({ status: 'running', found: 1000, imported: 900, failed: 100, total: 5000 })}
      />,
    );
    expect(bar()).toHaveAttribute('aria-valuenow', '20');
  });

  it('reaches 100 only when the run finishes', () => {
    render(<ImportStep api={api({ status: 'complete', found: 5000, imported: 5000, total: 5000 })} />);
    expect(bar()).toHaveAttribute('aria-valuenow', '100');
  });

  it('goes indeterminate rather than lying when the catalog size is unknown', () => {
    render(<ImportStep api={api({ status: 'running', found: 100, imported: 100, total: null })} />);
    expect(bar()).not.toHaveAttribute('aria-valuenow');
    expect(fill()).toHaveAttribute('data-indeterminate', 'true');
    expect(
      screen.getByText(/has not told us how big your catalog is/),
    ).toBeInTheDocument();
  });

  it('shows the real denominator in the counter, not the pages read so far', () => {
    render(<ImportStep api={api({ status: 'running', found: 100, imported: 100, total: 5000 })} />);
    expect(screen.getByText('100/5000')).toBeInTheDocument();
    expect(screen.getByText(/100 of 5000 products in/)).toBeInTheDocument();
  });

  it('never exceeds 100 if a stale total comes back low', () => {
    render(<ImportStep api={api({ status: 'running', found: 900, imported: 900, total: 500 })} />);
    expect(bar()).toHaveAttribute('aria-valuenow', '100');
  });
});

describe('the note under the bar', () => {
  it('no longer claims the import continues with the tab closed', () => {
    render(<ImportStep api={api({ status: 'running', found: 100, imported: 100, total: 5000 })} />);
    expect(screen.getByText(/Keep this tab open while the sync runs/)).toBeInTheDocument();
    expect(screen.queryByText(/^You can close this tab\./)).not.toBeInTheDocument();
  });
});
