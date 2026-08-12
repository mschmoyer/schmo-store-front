import * as React from 'react';
import Link from 'next/link';
import { Badge, Button, Input } from '@/components/ui';
import { ROUTES } from '../data/routes';
import { Reveal } from '../parts/Reveal';
import { SectionIntro } from '../parts/SectionIntro';
import styles from './HowItWorksSteps.module.css';

export interface HowItWorksStepsProps {
  /** Hides the trailing CTA when another CTA already sits nearby. */
  hideCta?: boolean;
  /** Heading level. Pass `h1` when this section opens a page. @default 'h2' */
  headingAs?: 'h1' | 'h2';
  /** Drops the eyebrow/heading/subhead when the page above already carries it. */
  hideIntro?: boolean;
}

/**
 * Copy deck §3.3 — three numbered steps with honest, measured time estimates.
 *
 * Laid out as a numbered timeline rather than three equal cards: the number
 * rail carries the eye down the page, the copy sits beside it, and each row
 * ends in a facsimile of the screen that step actually uses — built from the
 * same primitives the admin is built from, and marked `aria-hidden` so it is
 * decoration to a screen reader, never a second form.
 *
 * Gated per §3.3: step 3 describes store content fields and colour themes only.
 * No "drag and drop", fonts, layouts, sections or live preview until the
 * customizer in docs/storefront-theme-spec.md ships.
 *
 * @param props - {@link HowItWorksStepsProps}
 * @returns The setup section.
 */
export function HowItWorksSteps({
  hideCta = false,
  headingAs = 'h2',
  hideIntro = false,
}: HowItWorksStepsProps): React.JSX.Element {
  return (
    <section className={styles.root} id="how-it-works">
      <div className={styles.inner}>
        {hideIntro ? null : (
          <SectionIntro
            as={headingAs}
            eyebrow="Setup"
            heading="Three steps. One sitting."
            subhead="Times below are real, measured on a catalog of a few hundred SKUs. A very large catalog takes longer to sync — you don't have to sit and watch it."
          />
        )}

        <ol className={`${styles.steps} ${hideIntro ? styles.stepsFlush : ''}`}>
          <Reveal as="li" className={styles.step} delay={0}>
            <StepHead index={1} time="about 2 minutes" />
            <div className={styles.stepCopy}>
              <h3 className={styles.stepTitle}>Paste your ShipStation API key</h3>
              <p className={styles.stepBody}>
                Generate a key in ShipStation, paste it in, we test the connection before saving.
                Nothing syncs until you say go.
              </p>
            </div>
            <div className={styles.figure} aria-hidden="true">
              <Input
                label="ShipStation API key"
                mono
                readOnly
                tabIndex={-1}
                size="sm"
                defaultValue="a4f9c1e0b7d2438e9c15"
                hint="Settings → Account → API Settings"
              />
              <div className={styles.figureRow}>
                <Badge tone="mint" dot size="sm">
                  Connected
                </Badge>
                <span className={styles.figureNote}>We can see your ShipStation account.</span>
              </div>
            </div>
          </Reveal>

          <Reveal as="li" className={styles.step} delay={0.08}>
            <StepHead index={2} time="2–10 minutes, unattended" />
            <div className={styles.stepCopy}>
              <h3 className={styles.stepTitle}>We pull in your catalog</h3>
              <p className={styles.stepBody}>
                Products, SKUs, prices, images, stock levels, warehouses. You don&rsquo;t type
                anything. Big catalogs take longer; you can close the tab and come back.
              </p>
            </div>
            <div className={styles.figure} aria-hidden="true">
              <ul className={styles.syncList}>
                {[
                  ['Warehouses', 'done', '4'],
                  ['Products', 'done', '318'],
                  ['Inventory', 'running', '212'],
                  ['Locations', 'queued', '—'],
                ].map(([label, state, count]) => (
                  <li key={label} className={styles.syncItem} data-state={state}>
                    <span className={styles.syncDot} />
                    <span className={styles.syncLabel}>{label}</span>
                    <span className={styles.syncCount}>{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal as="li" className={styles.step} delay={0.16}>
            <StepHead index={3} time="about 5 minutes" />
            <div className={styles.stepCopy}>
              <h3 className={styles.stepTitle}>Name it, style it, publish</h3>
              <p className={styles.stepBody}>
                Store name, description, hero copy, a theme. Publish and your store is live at your
                RebelShops URL.
              </p>
            </div>
            <div className={styles.figure} aria-hidden="true">
              <Input
                label="Store name"
                readOnly
                tabIndex={-1}
                size="sm"
                defaultValue="Northgate Supply"
                hint="Shown in your store header and page titles"
              />
              <div className={styles.swatches}>
                {['#0E1014', '#D98A00', '#0FA871', '#2563EB', '#F94E1B', '#5A626F'].map(
                  (color, i) => (
                    <span
                      key={color}
                      className={`${styles.swatch} ${i === 4 ? styles.swatchActive : ''}`}
                      style={{ background: color }}
                    />
                  )
                )}
                <span className={styles.figureNote}>11 color themes</span>
              </div>
            </div>
          </Reveal>
        </ol>

        <Reveal delay={0.1}>
          <div className={styles.closing}>
            <p className={styles.closingLine}>
              Realistically: under 20 minutes from API key to a live store you can send someone.
            </p>
            {hideCta ? null : (
              <Button as={Link} href={ROUTES.signUp} size="lg">
                Start for $1
              </Button>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/**
 * The number-and-time row at the top of a step card.
 *
 * @param props.index - 1-based step number.
 * @param props.time - Honest, measured estimate.
 * @returns The step header row.
 */
function StepHead({ index, time }: { index: number; time: string }): React.JSX.Element {
  return (
    <div className={styles.stepHead}>
      <span className={styles.stepNumber}>{index}</span>
      <span className={styles.stepTime}>{time}</span>
    </div>
  );
}

export default HowItWorksSteps;
