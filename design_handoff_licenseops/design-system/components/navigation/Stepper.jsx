import React from 'react';

/**
 * Stepper — compact per-line-item stage progress. Renders dots connected by rules;
 * completed & current use accent, current gets a soft ring. Pass the ordered
 * `steps` and the `current` stage name (or index).
 */
export function Stepper({ steps = [], current = 0 }) {
  const currentIdx = typeof current === 'number' ? current : steps.indexOf(current);
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {steps.map((label, i) => {
        const done = i < currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <div style={{ width: 26, height: 2, background: i <= currentIdx ? 'var(--accent)' : 'var(--border-strong)' }} />
            )}
            <span
              title={label}
              style={{
                width: 11, height: 11, borderRadius: '50%', flexShrink: 0,
                border: `2px solid ${i <= currentIdx ? 'var(--accent)' : 'var(--border-strong)'}`,
                background: done ? 'var(--accent)' : 'var(--card)',
                boxShadow: isCurrent ? '0 0 0 3px var(--accent-soft)' : 'none',
              }}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
}
