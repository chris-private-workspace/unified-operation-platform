import React from 'react';

export interface InputProps {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  /** Leading icon (e.g. a search glyph). */
  icon?: React.ReactNode;
  /** Trailing slot (e.g. a ⌘K kbd hint). */
  trailing?: React.ReactNode;
  disabled?: boolean;
  style?: React.CSSProperties;
}

/** Single-line text field with optional leading icon and trailing slot. */
export function Input(props: InputProps): JSX.Element;
