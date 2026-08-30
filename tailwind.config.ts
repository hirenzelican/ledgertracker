import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-raised': 'rgb(var(--surface-raised) / <alpha-value>)',
        'surface-sunken': 'rgb(var(--surface-sunken) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        'ink-muted': 'rgb(var(--ink-muted) / <alpha-value>)',
        'ink-faint': 'rgb(var(--ink-faint) / <alpha-value>)',
        brand: 'rgb(var(--brand) / <alpha-value>)',
        'brand-ink': 'rgb(var(--brand-ink) / <alpha-value>)',
        'brand-soft': 'rgb(var(--brand-soft) / <alpha-value>)',
        'chart-in': 'rgb(var(--chart-in) / <alpha-value>)',
        'chart-out': 'rgb(var(--chart-out) / <alpha-value>)',
        received: 'rgb(var(--received) / <alpha-value>)',
        'received-soft': 'rgb(var(--received-soft) / <alpha-value>)',
        'received-ink': 'rgb(var(--received-ink) / <alpha-value>)',
        returned: 'rgb(var(--returned) / <alpha-value>)',
        'returned-soft': 'rgb(var(--returned-soft) / <alpha-value>)',
        'returned-ink': 'rgb(var(--returned-ink) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'slide-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(0.5rem) scale(0.97)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'slide-up': 'slide-up 220ms cubic-bezier(0.32, 0.72, 0, 1)',
        'fade-in': 'fade-in 160ms ease-out',
        'toast-in': 'toast-in 200ms cubic-bezier(0.32, 0.72, 0, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
