'use client';

/**
 * The storefront customizer shell.
 *
 * Owns the working draft, the autosave loop, the publish lifecycle and the
 * conversation with the preview iframe. Everything below it is presentational.
 *
 * The two timings that make this feel like a design tool rather than a form:
 *
 *  - **the visual push is immediate.** Every keystroke and every slider tick
 *    goes straight to the iframe over `postMessage`, which repaints its custom
 *    property block. No reload, no network, no flash.
 *  - **persistence is debounced.** The draft is written to Postgres a beat
 *    after the merchant stops, so a colour drag is one row write rather than
 *    two hundred.
 *
 * Losing work is treated as the worst possible outcome: the draft autosaves,
 * the status pill always says where things stand, and leaving with a save still
 * in flight prompts.
 */

import * as React from 'react';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconCheck } from '@tabler/icons-react';

import { Button, Card, CardBody, EmptyState, Spinner } from '@/components/ui';
import {
  PRESETS,
  previewUrl,
  resolveTheme,
  SECTION_TYPES,
  type Section,
  type SectionType,
} from '@/lib/storefront-theme';

import * as api from './api';
import { CatalogProvider, type Catalog } from './CatalogContext';
import { ConfirmDialog } from './chrome/ConfirmDialog';
import { PublishDialog } from './chrome/PublishDialog';
import type { SaveState } from './chrome/SaveStatus';
import { TopBar } from './chrome/TopBar';
import { contrastFindings, hasBlockingFinding } from './contrast/findings';
import { PreviewFrame, type ViewportId } from './preview/PreviewFrame';
import { AddSectionPicker } from './rail/AddSectionPicker';
import { Rail } from './rail/Rail';
import { THEME_GROUPS } from './rail/themeSchema';
import { diffDocs } from './state/diff';
import {
  canRedo as canRedoOf,
  canUndo as canUndoOf,
  cloneDoc,
  customizerReducer,
  hasUnpublishedChanges,
  hasUnsavedEdits,
  initialState,
  canAddSection,
} from './state/reducer';
import type { CustomizerDoc, Selection } from './state/types';
import styles from './Customizer.module.css';

/** How long after the last edit the draft is written to the database. */
const AUTOSAVE_DELAY_MS = 900;

const EMPTY_DOC: CustomizerDoc = { theme: {}, sections: [] };

export interface CustomizerProps {
  /**
   * Class exposing the storefront `--st-font-*` variables, produced by
   * `fonts.next` in the server page. Applied only to the font previews; the
   * customizer's own chrome never inherits a merchant token.
   */
  fontScopeClassName?: string;
}

type Dialog =
  | { kind: 'none' }
  | { kind: 'publish' }
  | { kind: 'discard' }
  | { kind: 'reset' }
  | { kind: 'preset'; presetId: string };

/**
 * The two-panel storefront customizer.
 * @param props - {@link CustomizerProps}
 * @returns The customizer, or its loading and error states
 */
export function Customizer({ fontScopeClassName }: CustomizerProps): React.ReactElement {
  const [state, dispatch] = React.useReducer(customizerReducer, initialState(EMPTY_DOC));
  const [booting, setBooting] = React.useState(true);
  const [bootError, setBootError] = React.useState<string | null>(null);
  const [meta, setMeta] = React.useState({ storeId: '', storeSlug: '', storeName: '' });
  const [previewSrc, setPreviewSrc] = React.useState<string | null>(null);
  const [viewport, setViewport] = React.useState<ViewportId>('desktop');
  const [saveState, setSaveState] = React.useState<SaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = React.useState<number | null>(null);
  const [publishing, setPublishing] = React.useState(false);
  const [dialog, setDialog] = React.useState<Dialog>({ kind: 'none' });
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [reloadToken, setReloadToken] = React.useState(0);
  const [catalog, setCatalog] = React.useState<Catalog>({
    collections: [],
    products: [],
    loading: true,
    error: null,
  });

  const { present } = state;

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */

  React.useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const payload = await api.loadTheme();
        if (cancelled) return;

        const doc: CustomizerDoc = { theme: payload.theme ?? {}, sections: payload.sections ?? [] };
        const published: CustomizerDoc | null = payload.published
          ? { theme: payload.published.theme ?? {}, sections: payload.published.sections ?? [] }
          : null;

        setMeta({
          storeId: payload.storeId,
          storeSlug: payload.storeSlug,
          storeName: payload.storeName || payload.storeSlug,
        });
        // Built once. The iframe's `src` must not change while editing.
        setPreviewSrc(previewUrl(payload.storeSlug, payload.previewToken));
        dispatch({ type: 'hydrate', doc, published });
        setBooting(false);
      } catch (error) {
        if (cancelled) return;
        setBootError(
          error instanceof Error ? error.message : 'Could not load your storefront theme.',
        );
        setBooting(false);
      }
    })();

    void (async () => {
      try {
        const payload = await api.loadCatalog();
        if (cancelled) return;
        setCatalog({ ...payload, loading: false, error: null });
      } catch (error) {
        if (cancelled) return;
        setCatalog({
          collections: [],
          products: [],
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to load the catalogue.',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ------------------------------------------------------------------ *
   * Derived
   * ------------------------------------------------------------------ */

  const resolved = React.useMemo(() => resolveTheme(present.theme), [present.theme]);
  const findings = React.useMemo(() => contrastFindings(present.theme), [present.theme]);
  const unsaved = hasUnsavedEdits(state);
  const unpublished = hasUnpublishedChanges(state);
  const changes = React.useMemo(
    () => diffDocs(state.published, present),
    [state.published, present],
  );

  /* ------------------------------------------------------------------ *
   * Autosave
   * ------------------------------------------------------------------ */

  const inFlight = React.useRef(false);
  const pending = React.useRef<CustomizerDoc | null>(null);

  const persist = React.useCallback(async (doc: CustomizerDoc): Promise<void> => {
    if (inFlight.current) {
      // Coalesce: whatever arrives while a save runs becomes the next save.
      pending.current = doc;
      return;
    }
    inFlight.current = true;
    setSaveState('saving');

    try {
      await api.saveDraft({ theme: doc.theme, sections: doc.sections });
      dispatch({ type: 'saved', doc });
      setLastSavedAt(Date.now());
      setSaveState('saved');
    } catch (error) {
      setSaveState('error');
      notifications.show({
        color: 'red',
        title: 'Could not save your draft',
        message:
          error instanceof Error
            ? error.message
            : 'Your changes are still here, but they have not reached the server.',
        icon: <IconAlertCircle size={16} />,
      });
    } finally {
      inFlight.current = false;
      const next = pending.current;
      pending.current = null;
      if (next) void persist(next);
    }
  }, []);

  React.useEffect(() => {
    if (booting || !unsaved) return undefined;
    setSaveState('dirty');
    const doc = cloneDoc(present);
    const timer = window.setTimeout(() => void persist(doc), AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [present, unsaved, booting, persist]);

  // A merchant closing the tab mid-save should be warned; one who has been
  // saved should not be nagged.
  React.useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (!unsaved && !inFlight.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [unsaved]);

  /* ------------------------------------------------------------------ *
   * Editing actions
   * ------------------------------------------------------------------ */

  const onThemeChange = React.useCallback((path: string, value: unknown): void => {
    dispatch({ type: 'theme/set', path, value, at: Date.now() });
  }, []);

  const onSectionSetting = React.useCallback(
    (id: string, fieldId: string, value: unknown): void => {
      dispatch({ type: 'sections/setting', id, field: fieldId, value, at: Date.now() });
    },
    [],
  );

  const onApplyFix = React.useCallback(
    (fix: { path: string; value: string | null }): void => {
      // `null` means "remove this field", which `setIn` does for `undefined`.
      dispatch({
        type: 'theme/set',
        path: fix.path,
        value: fix.value === null ? undefined : fix.value,
      });
    },
    [],
  );

  const onSelect = React.useCallback((selection: Selection): void => {
    dispatch({ type: 'select', selection });
  }, []);

  /** Clicking a section in the preview selects it in the rail. */
  const onPreviewSectionClick = React.useCallback((id: string): void => {
    dispatch({ type: 'tab', tab: 'sections' });
    dispatch({ type: 'select', selection: { kind: 'section', id } });
  }, []);

  /** Jump from a publish-blocking finding to the panel that owns it. */
  const goToFinding = React.useCallback((path: string): void => {
    const group = THEME_GROUPS.find((entry) =>
      entry.fields.some((descriptor) => descriptor.path === path),
    );
    setDialog({ kind: 'none' });
    dispatch({ type: 'tab', tab: 'theme' });
    if (group) dispatch({ type: 'select', selection: { kind: 'theme', group: group.id } });
  }, []);

  /* ------------------------------------------------------------------ *
   * Keyboard shortcuts
   * ------------------------------------------------------------------ */

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== 'z') return;
      const target = event.target as HTMLElement | null;
      // Let a text field keep its own undo stack.
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      event.preventDefault();
      dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  /* ------------------------------------------------------------------ *
   * Lifecycle actions
   * ------------------------------------------------------------------ */

  const onPublish = React.useCallback(async (): Promise<void> => {
    setPublishing(true);
    try {
      // Flush anything not yet written, so publish never promotes a stale draft.
      if (hasUnsavedEdits(state)) {
        await api.saveDraft({ theme: present.theme, sections: present.sections });
        dispatch({ type: 'saved', doc: cloneDoc(present) });
      }
      const payload = await api.publishDraft();
      dispatch({
        type: 'published',
        doc: { theme: payload.theme ?? {}, sections: payload.sections ?? [] },
      });
      setLastSavedAt(Date.now());
      setSaveState('saved');
      setDialog({ kind: 'none' });
      setReloadToken((n) => n + 1);
      notifications.show({
        color: 'teal',
        title: 'Your storefront is live',
        message: 'Every visitor now sees these changes.',
        icon: <IconCheck size={16} />,
      });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Publish failed',
        message: error instanceof Error ? error.message : 'Nothing was changed on your live shop.',
        icon: <IconAlertCircle size={16} />,
      });
    } finally {
      setPublishing(false);
    }
  }, [present, state]);

  const onDiscard = React.useCallback(async (): Promise<void> => {
    setPublishing(true);
    try {
      const payload = await api.resetDraft();
      const doc: CustomizerDoc = { theme: payload.theme ?? {}, sections: payload.sections ?? [] };
      dispatch({ type: 'hydrate', doc, published: state.published });
      setSaveState('saved');
      setLastSavedAt(Date.now());
      setDialog({ kind: 'none' });
      setReloadToken((n) => n + 1);
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Could not discard',
        message: error instanceof Error ? error.message : 'Your draft is unchanged.',
      });
    } finally {
      setPublishing(false);
    }
  }, [state.published]);

  const onResetToPreset = React.useCallback(async (): Promise<void> => {
    const presetId = typeof present.theme.preset === 'string' ? present.theme.preset : 'studio';
    setPublishing(true);
    try {
      const payload = await api.resetDraft(presetId);
      const doc: CustomizerDoc = { theme: payload.theme ?? {}, sections: payload.sections ?? [] };
      dispatch({ type: 'hydrate', doc, published: state.published });
      setSaveState('saved');
      setLastSavedAt(Date.now());
      setDialog({ kind: 'none' });
      setReloadToken((n) => n + 1);
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Could not reset',
        message: error instanceof Error ? error.message : 'Your draft is unchanged.',
      });
    } finally {
      setPublishing(false);
    }
  }, [present.theme.preset, state.published]);

  /**
   * Switching preset throws theme overrides away, so confirm when there is
   * something to lose and apply straight away when there is not.
   * @param presetId - The chosen preset
   */
  const onChoosePreset = React.useCallback(
    (presetId: string): void => {
      const overridden = Object.keys(present.theme).some(
        (key) => key !== 'preset' && key !== 'version' && key !== 'custom',
      );
      if (!overridden) {
        dispatch({ type: 'theme/preset', preset: presetId });
        return;
      }
      setDialog({ kind: 'preset', presetId });
    },
    [present.theme],
  );

  /* ------------------------------------------------------------------ *
   * Render
   * ------------------------------------------------------------------ */

  if (booting) {
    return (
      <div className={styles.loadingShell}>
        <Spinner size="lg" />
        <span>Opening the customizer…</span>
      </div>
    );
  }

  if (bootError) {
    return (
      <Card className={styles.errorShell}>
        <CardBody>
          <EmptyState
            title="The customizer could not start"
            description={bootError}
            action={
              <Button variant="primary" size="sm" onClick={() => window.location.reload()}>
                Try again
              </Button>
            }
          />
        </CardBody>
      </Card>
    );
  }

  const canAddAnySection = SECTION_TYPES.some((type: SectionType) =>
    canAddSection(present.sections, type),
  );

  /**
   * Whether one more of this section's type may exist.
   * @param section - The section being duplicated
   * @returns True when another copy is allowed
   */
  const canDuplicate = (section: Section): boolean =>
    canAddSection(present.sections, section.type);

  const presetName =
    dialog.kind === 'preset' ? (PRESETS[dialog.presetId]?.name ?? dialog.presetId) : '';

  return (
    <CatalogProvider value={catalog}>
      <div className={styles.shell}>
        <TopBar
          storeName={meta.storeName}
          storeSlug={meta.storeSlug}
          viewport={viewport}
          onViewportChange={setViewport}
          canUndo={canUndoOf(state)}
          canRedo={canRedoOf(state)}
          onUndo={() => dispatch({ type: 'undo' })}
          onRedo={() => dispatch({ type: 'redo' })}
          onDiscard={() => setDialog({ kind: 'discard' })}
          onPublish={() => setDialog({ kind: 'publish' })}
          onReloadPreview={() => setReloadToken((n) => n + 1)}
          saveState={saveState}
          lastSavedAt={lastSavedAt}
          unpublished={unpublished}
          publishing={publishing}
        />

        <div className={styles.body}>
          <Rail
            tab={state.tab}
            onTabChange={(tab) => dispatch({ type: 'tab', tab })}
            selection={state.selection}
            onSelect={onSelect}
            sections={present.sections}
            theme={present.theme}
            resolved={resolved as unknown as Record<string, unknown>}
            storeId={meta.storeId}
            onThemeChange={onThemeChange}
            onSectionSetting={onSectionSetting}
            onReorder={(ids) => dispatch({ type: 'sections/reorder', ids })}
            onMove={(from, to) => dispatch({ type: 'sections/move', from, to })}
            onToggleSection={(id) => dispatch({ type: 'sections/toggle', id })}
            onDuplicateSection={(id) => dispatch({ type: 'sections/duplicate', id })}
            onRemoveSection={(id) => dispatch({ type: 'sections/remove', id })}
            onAddSection={() => setPickerOpen(true)}
            onChoosePreset={onChoosePreset}
            onResetToPreset={() => setDialog({ kind: 'reset' })}
            canAddAnySection={canAddAnySection}
            canDuplicate={canDuplicate}
            findings={findings}
            onApplyFix={onApplyFix}
            fontScopeClassName={fontScopeClassName}
          />

          {previewSrc ? (
            <PreviewFrame
              src={previewSrc}
              viewport={viewport}
              theme={present.theme}
              sections={present.sections}
              onSectionClick={onPreviewSectionClick}
              reloadToken={reloadToken}
            />
          ) : (
            <div className={styles.canvas} />
          )}
        </div>
      </div>

      <AddSectionPicker
        opened={pickerOpen}
        onClose={() => setPickerOpen(false)}
        sections={present.sections}
        onAdd={(sectionType) => dispatch({ type: 'sections/add', sectionType })}
      />

      <PublishDialog
        opened={dialog.kind === 'publish'}
        onClose={() => setDialog({ kind: 'none' })}
        onConfirm={() => void onPublish()}
        publishing={publishing}
        changes={changes}
        blocking={hasBlockingFinding(findings) ? findings.filter((f) => f.level === 'fail') : []}
        onGoToFinding={goToFinding}
      />

      <ConfirmDialog
        opened={dialog.kind === 'discard'}
        title="Discard your draft?"
        description="Your live storefront is not affected either way."
        destructive
        busy={publishing}
        confirmLabel="Discard the draft"
        body={
          <p>
            This throws away every unpublished change and puts the draft back to exactly what your
            live storefront serves right now. It cannot be undone.
          </p>
        }
        onCancel={() => setDialog({ kind: 'none' })}
        onConfirm={() => void onDiscard()}
      />

      <ConfirmDialog
        opened={dialog.kind === 'reset'}
        title="Reset to the preset?"
        description="Your live storefront is not affected until you publish."
        destructive
        busy={publishing}
        confirmLabel="Reset the draft"
        body={
          <p>
            Your theme settings <strong>and every section</strong> go back to the way this preset
            ships. Any copy you have written in a section will be replaced.
          </p>
        }
        onCancel={() => setDialog({ kind: 'none' })}
        onConfirm={() => void onResetToPreset()}
      />

      <ConfirmDialog
        opened={dialog.kind === 'preset'}
        title={`Switch to ${presetName}?`}
        confirmLabel={`Use ${presetName}`}
        destructive
        body={
          <p>
            {presetName} replaces the colour, type, shape and layout choices you have made. Your
            sections and their copy stay exactly as they are, and so does your custom CSS.
          </p>
        }
        onCancel={() => setDialog({ kind: 'none' })}
        onConfirm={() => {
          if (dialog.kind === 'preset') {
            dispatch({ type: 'theme/preset', preset: dialog.presetId });
          }
          setDialog({ kind: 'none' });
        }}
      />
    </CatalogProvider>
  );
}
