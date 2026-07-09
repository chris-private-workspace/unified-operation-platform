import React from 'react';

export interface TabsProps {
  /** Tab defs as strings or {value,label,count}. */
  tabs: Array<string | { value: string; label: string; count?: number }>;
  value: string;
  onChange?: (value: string) => void;
}

/**
 * Underline tab bar for in-page section switching (Overview Summary/Analytics,
 * detail-panel sections). Active tab gets the accent underline; optional count pill.
 * Distinct from SegmentedControl (filled, for binary view/scope switches).
 */
export function Tabs(props: TabsProps): JSX.Element;
