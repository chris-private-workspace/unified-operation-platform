import React from 'react';

/** StatCard — a KPI tile: label + tinted icon chip, big value, optional delta pill, sub-line. */
export function StatCard({ label, value, icon, tone = 'info', delta = null, sub, style = {} }) {
  const toneVar = { ok: 'var(--ok)', warn: 'var(--warn)', info: 'var(--info)', danger: 'var(--danger)', neutral: 'var(--neutral)' }[tone] || 'var(--info)';
  const toneSoft = { ok: 'var(--ok-soft)', warn: 'var(--warn-soft)', info: 'var(--info-soft)', danger: 'var(--danger-soft)', neutral: 'var(--neutral-soft)' }[tone] || 'var(--info-soft)';
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 16px 14px', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: 10, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--fg-muted)', fontWeight: 500 }}>{label}</span>
        <span style={{ width: 28, height: 28, borderRadius: 8, background: toneSoft, color: toneVar, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <span style={{ fontSize: 27, fontWeight: 600, letterSpacing: '-.02em', lineHeight: 1 }}>{value}</span>
        {delta && (
          <span style={{ display: 'inline-flex', alignItems: 'center', padding: '1px 7px', borderRadius: 999, fontSize: 10.5, fontWeight: 600, background: 'var(--ok-soft)', color: 'var(--ok)' }}>{delta}</span>
        )}
      </div>
      {sub && <span style={{ fontSize: 11.5, color: 'var(--fg-subtle)' }}>{sub}</span>}
    </div>
  );
}
