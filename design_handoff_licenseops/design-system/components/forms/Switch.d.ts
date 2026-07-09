import React from 'react';

export interface SwitchProps {
  checked?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
}

/** Pill on/off toggle — reduce-motion, digest opt-in, and similar preferences. */
export function Switch(props: SwitchProps): JSX.Element;
