import React from 'react';

export interface DialogProps {
  open: boolean;
  title: React.ReactNode;
  onClose?: () => void;
  /** Right-aligned footer actions (Cancel + primary). */
  footer?: React.ReactNode;
  width?: number;
  children?: React.ReactNode;
}

/** Centered modal over a scrim. Used for SKU edit and confirmations. Click-scrim closes. */
export function Dialog(props: DialogProps): JSX.Element;
