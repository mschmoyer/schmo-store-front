import * as React from 'react';
import { Badge, Button, Input } from '@/components/ui';
import { ROUTES } from '../data/routes';
import { Rail } from '../parts/Rail';
import { Section } from '../parts/Section';
import { SectionIntro } from '../parts/SectionIntro';
import styles from './HowItWorksSteps.module.css';

export interface HowItWorksStepsProps {
  /** Hides the trailing CTA when another CTA already sits nearby. */
  hideCta?: boolean;
  /** Heading level. Pass `h1` when this section opens a page. @default 'h2' */
  headingAs?: 'h1' | 'h2';
  /** Drops the eyebrow/heading/subhead when the page above already carries it. */
  hideIntro?: boolean;
  /**
   * Renders the per-step screen facsimiles. They are the point of
   * `/how-it-works`; on the homepage they were roughly 900px of decoration in
   * front of a reader who has not yet decided to care, so the homepage asks for
   * the steps without them. @default true
   */
  showFigures?: boolean;
}

/**
 * Copy deck §3.3 — three numbered steps with honest, measured time estimates.
 *
 * Laid out as a numbered timeline rather than three equal cards: the number
 * rail carries the eye down the page and the copy sits beside it. With
 * `showFigures` each row also ends in a facsimile of the screen that step
 * actually uses — built from the same primitives the admin is built from, and
 * marked `aria-hidden` so it is decoration to a screen reader, never a second
 * form.
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
  showFigures = true,
}: HowItWorksStepsProps): React.JSX.Element {
  const steps = buildSteps(showFigures);

  return (
    <Section id="how-it-works" ruled={!hideIntro}>
      {hideIntro ? null : (
        <SectionIntro
          as={headingAs}
          eyebrow="Setup"
          heading="Three steps. One sitting."
          subhead="Times below are real, measured on a catalog of a few hundred SKUs. A very large catalog takes longer to sync — you don't have to sit and watch it."
        />
      )}

      {showFigures ? (
        <ol className={[styles.steps, hideIntro ? styles.stepsFlush : ''].filter(Boolean).join(' ')}>
          {steps.map((step) => (
            <li key={step.index} className={styles.step}>
              <StepHead index={step.index} time={step.time} />
              <div className={styles.stepCopy}>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepBody}>{step.body}</p>
              </div>
              {step.figure ? (
                <div className={styles.figure} aria-hidden="true">
                  {step.figure}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        /*
          The homepage variant. Three steps that simply stacked were 680px of a
          phone's scroll for three short paragraphs; as a rail they are one card
          tall and the reader can see at a glance that there are three of them.
        */
        <Rail
          label="The three setup steps"
          ordered
          className={[styles.compact, hideIntro ? styles.stepsFlush : ''].filter(Boolean).join(' ')}
        >
          {steps.map((step) => (
            <div key={step.index} className={styles.compactStep}>
              <div className={styles.compactHead}>
                <span className={styles.stepNumber}>{step.index}</span>
                <span className={styles.stepTime}>{step.time}</span>
              </div>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepBody}>{step.body}</p>
            </div>
          ))}
        </Rail>
      )}

      <div className={styles.closing}>
        <p className={styles.closingLine}>
          Realistically: under 20 minutes from API key to a live store you can send someone.
        </p>
        {hideCta ? null : (
          <Button href={ROUTES.signUp} size="lg">
            Start for $1
          </Button>
        )}
      </div>
    </Section>
  );
}

interface Step {
  index: number;
  /** Honest, measured estimate. */
  time: string;
  title: string;
  body: React.ReactNode;
  /** The screen facsimile, or null when the caller asked for the short form. */
  figure: React.ReactNode | null;
}

/**
 * The three steps, in one place, so the deep `/how-it-works` timeline and the
 * homepage rail cannot drift apart in copy or in timings.
 *
 * @param withFigures - Whether to build the per-step screen facsimiles.
 * @returns The three steps.
 */
function buildSteps(withFigures: boolean): Step[] {
  return [
    {
      index: 1,
      time: 'about 2 minutes',
      title: 'Paste your ShipStation API key',
      body: 'Generate a key in ShipStation, paste it in, we test the connection before saving. Nothing syncs until you say go.',
      figure: withFigures ? (
        <>
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
        </>
      ) : null,
    },
    {
      index: 2,
      time: '2–10 minutes, unattended',
      title: 'We pull in your catalog',
      body: (
        <>
          Products, SKUs, prices, images, stock levels, warehouses. You don&rsquo;t type anything.
          Big catalogs take longer; you can close the tab and come back.
        </>
      ),
      figure: withFigures ? (
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
      ) : null,
    },
    {
      index: 3,
      time: 'about 5 minutes',
      title: 'Name it, style it, publish',
      body: 'Store name, description, hero copy, a theme. Publish and your store is live at your RebelShops URL.',
      figure: withFigures ? (
        <>
          <Input
            label="Store name"
            readOnly
            tabIndex={-1}
            size="sm"
            defaultValue="Northgate Supply"
            hint="Shown in your store header and page titles"
          />
          <div className={styles.swatches}>
            {['#111214', '#B45309', '#0F7B4A', '#2F5D8C', '#6B6F76', '#B42318'].map((color, i) => (
              <span
                key={color}
                className={`${styles.swatch} ${i === 0 ? styles.swatchActive : ''}`}
                style={{ background: color }}
              />
            ))}
            <span className={styles.figureNote}>11 color themes</span>
          </div>
        </>
      ) : null,
    },
  ];
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
