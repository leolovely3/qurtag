import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: 'class',
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
          DEFAULT: '#0A0B0F',
          50: '#F7F7F8',
          100: '#EEEEF0',
          200: '#D5D6D9',
          300: '#A8A9AE',
          400: '#76787F',
          500: '#52545B',
          600: '#34363D',
          700: '#1E2026',
          800: '#13151A',
          900: '#0A0B0F',
          950: '#050608',
        },
        // Single warm white for surfaces that need to read "off-white"
        paper: '#FAFAF7',
        canvas: '#FFFFFF',
        // Editorial accent. Used sparingly.
        signal: {
          DEFAULT: '#FF5C2E',
          50: '#FFF0EB',
          100: '#FFE0D6',
          200: '#FFC0AC',
          300: '#FF9F82',
          400: '#FF7E58',
          500: '#FF5C2E',
          600: '#E14515',
          700: '#AE3411',
          800: '#7C250C',
          900: '#491607',
        },
        verdigris: {
          DEFAULT: '#3F5A52',
          50: '#F1F5F3',
          100: '#DCE6E2',
          200: '#B8CDC4',
          300: '#8DAE9F',
          400: '#618D7B',
          500: '#3F5A52',
          600: '#324942',
          700: '#283A35',
          800: '#1E2C29',
          900: '#161F1D',
        },
        // Secondary text
        muted: '#76787F',
        // Semantic surfaces
        hairline: 'rgba(10, 11, 15, 0.08)',
        'hairline-strong': 'rgba(10, 11, 15, 0.14)',
        'hairline-dark': 'rgba(255, 255, 255, 0.10)',
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
        cairn: '0.5rem',
        'cairn-2': '1rem',
        'cairn-3': '1.5rem',
        'cairn-5': '2.5rem',
        'cairn-8': '4rem',
        'cairn-12': '6rem',
        'cairn-16': '8rem',
        'cairn-24': '12rem',
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
        cairn: 'cubic-bezier(0.32, 0.72, 0, 1)',
        'cairn-in': 'cubic-bezier(0.4, 0.0, 1, 1)',
        'cairn-out': 'cubic-bezier(0.0, 0.0, 0.2, 1)',
      },
      transitionDuration: {
        cairn: '320ms',
        'cairn-slow': '560ms',
        'cairn-deliberate': '800ms',
      },
      backgroundImage: {
        'signal-glow':
          'radial-gradient(60% 50% at 50% 40%, rgba(255, 92, 46, 0.16) 0%, rgba(255, 92, 46, 0) 70%)',
        'dark-grain':
          'radial-gradient(120% 80% at 50% 0%, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 60%)',
      },
      keyframes: {
        'cairn-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.65' },
        },
        'cairn-fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'cairn-shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'cairn-pulse': 'cairn-pulse 2.8s cubic-bezier(0.4, 0.0, 0.2, 1) infinite',
        'cairn-fade-up': 'cairn-fade-up 560ms cubic-bezier(0.32, 0.72, 0, 1) both',
      },
    },
  },
  plugins: [animate],
};

export default config;
