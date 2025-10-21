/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    './node_modules/@massalabs/react-ui-kit/src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Light mode colors
        primary: '#3B82F6',
        secondary: '#FFFFFF',
        tertiary: '#F1F5F9',
        neutral: '#1A1F36',
        brand: '#3B82F6',
        background: '#F8FAFC',
        border: '#E2E8F0',
        card: '#FFFFFF',

        // Dark mode colors
        darkBg: '#0F172A',
        darkCard: '#1E293B',
        darkText: '#F8FAFC',
        darkMuted: '#94A3B8',
        darkBorder: '#334155',
        darkAccent: '#60A5FA',
        darkSecondary: '#1E293B',
        darkTertiary: '#334155',
      },
      fontFamily: {
        caveat: ['Caveat', 'cursive'],
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '100% 100%' },
        },
      },
      animation: {
        shimmer: 'shimmer 2s linear infinite',
      },
    },
  },
  presets: [require('@massalabs/react-ui-kit/presets/massa-station-preset.js')],
};
