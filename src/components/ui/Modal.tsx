'use client';

import * as React from 'react';
import { Modal as MantineModal, type ModalProps as MantineModalProps } from '@mantine/core';
import { cn } from '@/lib/design/cn';
import styles from './Overlay.module.css';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

const SIZE_MAP: Record<ModalSize, string> = {
  sm: '420px',
  md: '560px',
  lg: '760px',
  xl: '980px',
  full: '100%',
};

export interface ModalProps extends Omit<MantineModalProps, 'size' | 'title' | 'classNames'> {
  /** Dialog title. Rendered in the display face and wired to `aria-labelledby`. */
  title?: React.ReactNode;
  /** One line of context under the title. */
  description?: React.ReactNode;
  /** Token width. @default 'md' */
  size?: ModalSize;
  /** Action tray rendered at the foot of the dialog body. */
  footer?: React.ReactNode;
  /** Extra class for the dialog surface. */
  contentClassName?: string;
  /** Extra class for the dialog body. */
  bodyClassName?: string;
}

/**
 * Modal over Mantine's, wearing our surface, scrim, radius and elevation.
 *
 * Use a modal only for work that must block the page. Anything browsable — a
 * filter panel, a detail view — belongs in a `Drawer` or its own route.
 *
 * @param props - {@link ModalProps} plus Mantine's modal props.
 * @returns A themed dialog.
 */
export function Modal({
  title,
  description,
  size = 'md',
  footer,
  children,
  contentClassName,
  bodyClassName,
  centered = true,
  radius = 'lg',
  overlayProps,
  ...rest
}: ModalProps): React.ReactElement {
  return (
    <MantineModal
      title={
        title ? (
          <span className={styles.titleBlock}>
            <span className={styles.title}>{title}</span>
            {description ? <span className={styles.description}>{description}</span> : null}
          </span>
        ) : undefined
      }
      size={SIZE_MAP[size]}
      centered={centered}
      radius={radius}
      overlayProps={{ backgroundOpacity: 0.55, blur: 3, ...overlayProps }}
      transitionProps={{ transition: 'pop', duration: 180 }}
      classNames={{
        content: cn(styles.content, contentClassName),
        header: styles.header,
        body: cn(styles.body, bodyClassName),
        overlay: styles.overlay,
      }}
      {...rest}
    >
      {children}
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </MantineModal>
  );
}

export default Modal;
