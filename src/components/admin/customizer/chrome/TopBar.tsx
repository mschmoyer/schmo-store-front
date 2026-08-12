'use client';

/**
 * The customizer's top bar.
 *
 * Its job is to answer, at a glance and without being asked: which shop am I
 * editing, what size am I looking at, can I take that back, is my work saved,
 * and is what I am looking at live yet.
 */

import * as React from 'react';
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconExternalLink,
  IconRefresh,
  IconRocket,
} from '@tabler/icons-react';

import { Badge, Button, Tooltip } from '@/components/ui';

import { VIEWPORTS, type ViewportId } from '../preview/PreviewFrame';
import { SaveStatus, type SaveState } from './SaveStatus';
import styles from '../Customizer.module.css';

const VIEWPORT_ICONS: Record<ViewportId, React.ComponentType<{ size?: number }>> = {
  desktop: IconDeviceDesktop,
  tablet: IconDeviceTablet,
  mobile: IconDeviceMobile,
};

export interface TopBarProps {
  storeName: string;
  storeSlug: string;
  viewport: ViewportId;
  onViewportChange: (viewport: ViewportId) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDiscard: () => void;
  onPublish: () => void;
  onReloadPreview: () => void;
  saveState: SaveState;
  lastSavedAt: number | null;
  /** True when the draft differs from what the public storefront serves. */
  unpublished: boolean;
  publishing: boolean;
}

/**
 * The customizer chrome bar.
 * @param props - {@link TopBarProps}
 * @returns The top bar
 */
export function TopBar({
  storeName,
  storeSlug,
  viewport,
  onViewportChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onDiscard,
  onPublish,
  onReloadPreview,
  saveState,
  lastSavedAt,
  unpublished,
  publishing,
}: TopBarProps): React.ReactElement {
  return (
    <div className={styles.topBar}>
      <div className={styles.storeBlock}>
        <span className={styles.storeName}>{storeName}</span>
        <span className={styles.storeMeta}>
          {/* One account edits one shop, so there is no store switcher here —
              the session decides which storefront this is. */}
          <a
            href={`/store/${storeSlug}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            /store/{storeSlug}
            <IconExternalLink size={11} aria-hidden="true" />
          </a>
        </span>
      </div>

      <div className={styles.toolGroup} role="group" aria-label="Preview size">
        {(Object.keys(VIEWPORTS) as ViewportId[]).map((id) => {
          const Icon = VIEWPORT_ICONS[id];
          return (
            <Tooltip key={id} label={VIEWPORTS[id].label}>
              <button
                type="button"
                className={styles.viewportButton}
                aria-pressed={viewport === id}
                aria-label={`${VIEWPORTS[id].label} preview`}
                onClick={() => onViewportChange(id)}
              >
                <Icon size={16} />
              </button>
            </Tooltip>
          );
        })}
        <span className={styles.viewportSize} aria-live="polite">
          {VIEWPORTS[viewport].width ? `${VIEWPORTS[viewport].width}px` : 'Fluid'}
        </span>
      </div>

      <div className={styles.toolGroup} role="group" aria-label="History">
        <Tooltip label="Undo (⌘Z)">
          <button
            type="button"
            className={styles.viewportButton}
            aria-label="Undo"
            disabled={!canUndo}
            style={canUndo ? undefined : { opacity: 0.4, cursor: 'not-allowed' }}
            onClick={onUndo}
          >
            <IconArrowBackUp size={16} />
          </button>
        </Tooltip>
        <Tooltip label="Redo (⇧⌘Z)">
          <button
            type="button"
            className={styles.viewportButton}
            aria-label="Redo"
            disabled={!canRedo}
            style={canRedo ? undefined : { opacity: 0.4, cursor: 'not-allowed' }}
            onClick={onRedo}
          >
            <IconArrowForwardUp size={16} />
          </button>
        </Tooltip>
        <Tooltip label="Reload the preview">
          <button
            type="button"
            className={styles.viewportButton}
            aria-label="Reload the preview"
            onClick={onReloadPreview}
          >
            <IconRefresh size={16} />
          </button>
        </Tooltip>
      </div>

      <div className={styles.topBarSpacer} />

      <SaveStatus state={saveState} lastSavedAt={lastSavedAt} />

      {unpublished ? (
        <Badge tone="amber" dot size="sm">
          Not live yet
        </Badge>
      ) : (
        <Badge tone="mint" dot size="sm">
          Live
        </Badge>
      )}

      <Button variant="ghost" size="sm" onClick={onDiscard} disabled={!unpublished || publishing}>
        Discard changes
      </Button>

      <Button
        variant="primary"
        size="sm"
        loading={publishing}
        disabled={!unpublished}
        leftIcon={<IconRocket size={15} aria-hidden="true" />}
        onClick={onPublish}
      >
        {/* Copy deck §5.1 says "Publish changes"; it pairs with "Discard
            changes" beside it and names what is actually going live. */}
        {unpublished ? 'Publish changes' : 'Published'}
      </Button>
    </div>
  );
}
