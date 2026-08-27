import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        brand: {
          50:  '#eef7ff',
          100: '#d8ecff',
          200: '#afd9ff',
          300: '#78bdff',
          400: '#3d9af7',
          500: '#147fe3',
          600: '#0d63c7',
          700: '#0b4fa3',
          800: '#0a3f80',
          900: '#082f63',
        },
        navy: {
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        surface: {
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
        },
        // Legacy compat
        primary: '#147fe3',
        success: '#10b981',
        warning: '#f59e0b',
        error:   '#ef4444',
      },
      boxShadow: {
        'card':     '0 1px 2px rgba(15,23,42,0.04), 0 2px 8px rgba(15,23,42,0.04)',
        'card-hover': '0 4px 12px rgba(15,23,42,0.06), 0 8px 24px rgba(20,127,227,0.10)',
        'elevated': '0 8px 32px rgba(15,23,42,0.1), 0 2px 8px rgba(15,23,42,0.06)',
        'glow':     '0 0 20px rgba(20,127,227,0.16)',
        'sidebar':  '4px 0 24px rgba(15,23,42,0.2)',
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '20px',
        '4xl': '24px',
      },
      animation: {
        'fade-in':    'fadeIn 0.35s ease-out both',
        'slide-up':   'slideUp 0.4s ease-out both',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(20,127,227,0.4)' },
          '50%':      { boxShadow: '0 0 0 6px rgba(20,127,227,0)' },
        },
      },
    },
  },
  plugins: [],
};
