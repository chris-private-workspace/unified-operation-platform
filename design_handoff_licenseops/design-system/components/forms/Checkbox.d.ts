import React from 'react';

export interface CheckboxProps {
  checked?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Inline label rendered to the right. */
  label?: React.ReactNode;
  disabled?: boolean;
  style?: React.CSSProperties;
}

/** Accent-colored checkbox with optional inline label. */
export function Checkbox(props: CheckboxProps): JSX.Element;
