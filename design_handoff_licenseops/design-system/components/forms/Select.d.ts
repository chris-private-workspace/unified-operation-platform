import React from 'react';

export interface SelectProps {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  disabled?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/** Native <select> styled to match Input — used in dialogs and preferences. */
export function Select(props: SelectProps): JSX.Element;
