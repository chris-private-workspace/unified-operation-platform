import React from 'react';

export interface StepperProps {
  /** Ordered stage labels for this line item's path. */
  steps: string[];
  /** Current stage — name or 0-based index. */
  current: string | number;
}

/**
 * Compact dot stepper for a line item's lifecycle. Short path is
 * [Requested, Ready, Assigned]; procurement path adds Quoting → OpCo approved →
 * Awaiting vendor before Ready. Completed/current dots are accent; current is ringed.
 */
export function Stepper(props: StepperProps): JSX.Element;
