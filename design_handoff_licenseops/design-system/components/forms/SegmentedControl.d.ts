import React from 'react';

export interface SegmentedControlProps {
  /** Options as strings, or {value,label} objects. 2–3 recommended. */
  options: Array<string | { value: string; label: string }>;
  value: string;
  onChange?: (value: string) => void;
  size?: 'sm' | 'md';
}

/**
 * Bordered segmented control; active segment fills Ricoh red. For binary/ternary
 * view switches — theme, role scope, License-Assets Single vs Compare.
 */
export function SegmentedControl(props: SegmentedControlProps): JSX.Element;
