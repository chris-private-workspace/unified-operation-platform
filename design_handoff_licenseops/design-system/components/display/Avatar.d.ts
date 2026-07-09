import React from 'react';

export interface AvatarProps {
  /** Full name — initials are derived from the first two words. */
  name: string;
  /** Diameter in px (default 30). */
  size?: number;
  /** `brand` = Ricoh-red gradient (current user); `muted` = neutral disc. */
  variant?: 'brand' | 'muted';
  style?: React.CSSProperties;
}

/** Initials avatar disc. Brand gradient for the signed-in user, muted in list rows. */
export function Avatar(props: AvatarProps): JSX.Element;
