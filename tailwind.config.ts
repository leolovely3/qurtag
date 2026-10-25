import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: 'class',
  // Hover styles only where a pointer can hover, so a tap on a phone never sticks in a hover state.
  future: { hoverOnlyWhenSupported: true },
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1.25rem',
        md: '2rem',
        lg: '3rem',
      },
      screens: {
        '2xl': '1320px',
      },
    },
    extend: {
      colors: {
        // Pure-white-first, deep black ink. Apple/Tumi/Things palette.
        ink: {
          DEFAULT: 'rgb(var(--ink-900) / <alpha-value>)',
          50: 'rgb(var(--ink-50) / <alpha-value>)',
          100: 'rgb(var(--ink-100) / <alpha-value>)',
          200: 'rgb(var(--ink-200) / <alpha-value>)',
          300: 'rgb(var(--ink-300) / <alpha-value>)',
          400: 'rgb(var(--ink-400) / <alpha-value>)',
          500: 'rgb(var(--ink-500) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          800: 'rgb(var(--ink-800) / <alpha-value>)',
          900: 'rgb(var(--ink-900) / <alpha-value>)',
          950: 'rgb(var(--ink-950) / <alpha-value>)',
        },
        // Single warm white for surfaces that need to read "off-white"
        paper: 'rgb(var(--paper) / <alpha-value>)',
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        // Editorial accent. Used sparingly.
        signal: {
          DEFAULT: 'rgb(var(--signal-500) / <alpha-value>)',
          50: 'rgb(var(--signal-50) / <alpha-value>)',
          100: 'rgb(var(--signal-100) / <alpha-value>)',
          200: 'rgb(var(--signal-200) / <alpha-value>)',
          300: 'rgb(var(--signal-300) / <alpha-value>)',
          400: 'rgb(var(--signal-400) / <alpha-value>)',
          500: 'rgb(var(--signal-500) / <alpha-value>)',
          600: 'rgb(var(--signal-600) / <alpha-value>)',
          700: 'rgb(var(--signal-700) / <alpha-value>)',
          800: 'rgb(var(--signal-800) / <alpha-value>)',
          900: 'rgb(var(--signal-900) / <alpha-value>)',
        },
        verdigris: {
          DEFAULT: 'rgb(var(--verdigris-500) / <alpha-value>)',
          50: 'rgb(var(--verdigris-50) / <alpha-value>)',
          100: 'rgb(var(--verdigris-100) / <alpha-value>)',
          200: 'rgb(var(--verdigris-200) / <alpha-value>)',
          300: 'rgb(var(--verdigris-300) / <alpha-value>)',
          400: 'rgb(var(--verdigris-400) / <alpha-value>)',
          500: 'rgb(var(--verdigris-500) / <alpha-value>)',
          600: 'rgb(var(--verdigris-600) / <alpha-value>)',
          700: 'rgb(var(--verdigris-700) / <alpha-value>)',
          800: 'rgb(var(--verdigris-800) / <alpha-value>)',
          900: 'rgb(var(--verdigris-900) / <alpha-value>)',
        },
        // Secondary text
        muted: 'rgb(var(--muted) / <alpha-value>)',
        // Semantic surfaces
        hairline: 'var(--hairline)',
        'hairline-strong': 'var(--hairline-strong)',
        'hairline-dark': 'var(--hairline)',
      },
      fontFamily: {
        // Single family — Inter variable. Used at all weights.
        sans: ['"Inter var"', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        // Same family but rendered with Display tracking adjustments via fontFeatureSettings.
        display: ['"Inter var"', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        // Tighter, sharper, more confident.
        eyebrow: ['0.75rem', { lineHeight: '1.4', letterSpacing: '0.14em' }],
        micro: ['0.75rem', { lineHeight: '1.5' }],
        caption: ['0.8125rem', { lineHeight: '1.5' }],
        body: ['1rem', { lineHeight: '1.6' }],
        lede: ['1.25rem', { lineHeight: '1.5', letterSpacing: '-0.011em' }],
        h6: ['1rem', { lineHeight: '1.3', letterSpacing: '-0.011em' }],
        h5: ['1.25rem', { lineHeight: '1.25', letterSpacing: '-0.014em' }],
        h4: ['1.625rem', { lineHeight: '1.2', letterSpacing: '-0.018em' }],
        h3: ['2.25rem', { lineHeight: '1.1', letterSpacing: '-0.022em' }],
        h2: ['3.25rem', { lineHeight: '1.05', letterSpacing: '-0.028em' }],
        h1: ['4.5rem', { lineHeight: '1.0', letterSpacing: '-0.034em' }],
        display: ['6.5rem', { lineHeight: '0.95', letterSpacing: '-0.04em' }],
        'display-xl': ['8.5rem', { lineHeight: '0.92', letterSpacing: '-0.045em' }],
      },
      spacing: {
        qurtag: '0.5rem',
        'qurtag-2': '1rem',
        'qurtag-3': '1.5rem',
        'qurtag-5': '2.5rem',
        'qurtag-8': '4rem',
        'qurtag-12': '6rem',
        'qurtag-16': '8rem',
        'qurtag-24': '12rem',
      },
      borderRadius: {
        sm: '0.375rem',
        card: '0.625rem',
        modal: '1rem',
        device: '2.5rem',
        pill: '9999px',
      },
      boxShadow: {
        card: '0 1px 1px rgba(10, 11, 15, 0.04), 0 1px 3px rgba(10, 11, 15, 0.06)',
        elevated:
          '0 12px 32px -8px rgba(10, 11, 15, 0.10), 0 4px 12px -2px rgba(10, 11, 15, 0.06)',
        device:
          '0 30px 60px -16px rgba(10, 11, 15, 0.32), 0 12px 24px -8px rgba(10, 11, 15, 0.16)',
        modal: '0 24px 60px -16px rgba(10, 11, 15, 0.24), 0 8px 24px -8px rgba(10, 11, 15, 0.12)',
        'inset-hairline': 'inset 0 0 0 1px rgba(10, 11, 15, 0.08)',
        'inset-hairline-dark': 'inset 0 0 0 1px rgba(255, 255, 255, 0.10)',
      },
      transitionTimingFunction: {
        qurtag: 'cubic-bezier(0.32, 0.72, 0, 1)',
        'qurtag-in': 'cubic-bezier(0.4, 0.0, 1, 1)',
        'qurtag-out': 'cubic-bezier(0.0, 0.0, 0.2, 1)',
      },
      transitionDuration: {
        qurtag: '320ms',
        'qurtag-slow': '560ms',
        'qurtag-deliberate': '800ms',
      },
      backgroundImage: {
        'signal-glow':
          'radial-gradient(60% 50% at 50% 40%, rgba(255, 92, 46, 0.16) 0%, rgba(255, 92, 46, 0) 70%)',
        'dark-grain':
          'radial-gradient(120% 80% at 50% 0%, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 60%)',
      },
      keyframes: {
        'qurtag-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.65' },
        },
        'qurtag-fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'qurtag-shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'qurtag-pulse': 'qurtag-pulse 2.8s cubic-bezier(0.4, 0.0, 0.2, 1) infinite',
        'qurtag-fade-up': 'qurtag-fade-up 560ms cubic-bezier(0.32, 0.72, 0, 1) both',
      },
    },
  },
  plugins: [animate],
};

export default config;
