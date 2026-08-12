'use client';

import * as React from 'react';
import { Drawer as MantineDrawer, type DrawerProps as MantineDrawerProps } from '@mantine/core';
import { cn } from '@/lib/design/cn';
import styles from './Overlay.module.css';
import { EASE_OUT } from './motion';

export type DrawerSize = 'sm' | 'md' | 'lg' | 'full';

const SIZE_MAP: Record<DrawerSize, string> = {
  sm: '340px',
  md: '440px',
  lg: '620px',
  full: '100%',
};

export interface DrawerProps extends Omit<MantineDrawerProps, 'size' | 'title' | 'classNames'> {
  /** Panel title. Rendered in the display face. */
  title?: React.ReactNode;
  /** One line of context under the title. */
  description?: React.ReactNode;
  /** Token width (or height, for top/bottom positions). @default 'md' */
  size?: DrawerSize;
  /** Sticky action tray pinned to the bottom of the panel. */
  footer?: React.ReactNode;
  /** Extra class for the panel surface. */
  contentClassName?: string;
}

/**
 * Side panel over Mantine's Drawer. Prefer this to a Modal whenever the user
 * still needs the page behind it for context — cart, filters, quick edit.
 *
 * @param props - {@link DrawerProps} plus Mantine's drawer props.
 * @returns A themed side panel.
 */
export function Drawer({
  title,
  description,
  size = 'md',
  footer,
  children,
  contentClassName,
  position = 'right',
  overlayProps,
  ...rest
}: DrawerProps): React.ReactElement {
  return (
    <MantineDrawer
      title={
        title ? (
          <span className={styles.titleBlock}>
            <span className={styles.title}>{title}</span>
            {description ? <span className={styles.description}>{description}</span> : null}
          </span>
        ) : undefined
      }
      size={SIZE_MAP[size]}
      position={position}
      overlayProps={{ backgroundOpacity: 0.5, blur: 3, ...overlayProps }}
      transitionProps={{ duration: 220, timingFunction: EASE_OUT }}
      classNames={{
        content: cn(styles.content, styles.drawerContent, contentClassName),
        header: styles.header,
        body: cn(styles.body, styles.drawerBody),
        overlay: styles.overlay,
      }}
      {...rest}
    >
      {children}
      {footer ? <div className={cn(styles.footer, styles.drawerFooter)}>{footer}</div> : null}
    </MantineDrawer>
  );
}

export default Drawer;
