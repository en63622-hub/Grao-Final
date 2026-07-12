/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0F1B14',
        paper: '#F6F5F0',
        moss: {
          50: '#F1F6F1',
          100: '#DCEBDD',
          200: '#B7D6B9',
          300: '#8FBE93',
          400: '#5FA166',
          500: '#3E7E46',
          600: '#2E6337',
          700: '#254E2C',
          800: '#1D3D23',
          900: '#152E1A'
        },
        clay: '#C1622D',
        gold: '#C9A227',
        rose: '#B23A48',
        slate2: '#5B6660'
      },
      fontFamily: {
        display: ['"Fraunces"', 'ui-serif', 'Georgia', 'serif'],
        body: ['"Inter"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace']
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,27,20,0.06), 0 8px 24px -12px rgba(15,27,20,0.18)'
      },
      borderRadius: {
        xl2: '1.25rem'
      }
    }
  },
  plugins: []
}
