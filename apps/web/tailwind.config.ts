import type { Config } from 'tailwindcss';

/**
 * Tailwind theme = a thin alias layer over the design_handoff CSS vars
 * (imported via src/index.css). We NEVER copy hex/px here — values live in
 * design_handoff_licenseops/design-system/tokens/*.css (machine truth).
 * See docs/02-architecture/design-system.md §1.5.
 */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        panel: 'var(--panel)',
        card: 'var(--card)',
        sidebar: 'var(--sidebar)',
        hover: 'var(--hover)',
        active: 'var(--active)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        fg: 'var(--fg)',
        'fg-muted': 'var(--fg-muted)',
        'fg-subtle': 'var(--fg-subtle)',
        accent: 'var(--accent)',
        'accent-fg': 'var(--accent-fg)',
        'accent-soft': 'var(--accent-soft)',
        'accent-line': 'var(--accent-line)',
        ok: 'var(--ok)',
        'ok-soft': 'var(--ok-soft)',
        warn: 'var(--warn)',
        'warn-soft': 'var(--warn-soft)',
        info: 'var(--info)',
        'info-soft': 'var(--info-soft)',
        danger: 'var(--danger)',
        'danger-soft': 'var(--danger-soft)',
        neutral: 'var(--neutral)',
        'neutral-soft': 'var(--neutral-soft)',
        purple: 'var(--purple)',
        'purple-soft': 'var(--purple-soft)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: {
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        '2xl': 'var(--radius-2xl)',
        '3xl': 'var(--radius-3xl)',
        pill: 'var(--radius-pill)',
      },
      boxShadow: {
        DEFAULT: 'var(--shadow)',
        overlay: 'var(--shadow-overlay)',
        toast: 'var(--shadow-toast)',
      },
    },
  },
  plugins: [],
} satisfies Config;
