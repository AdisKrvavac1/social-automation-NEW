import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        mm: {
          green: '#3E7324',
          dark: '#2C5419',
          tint: '#E8F2DB',
          cream: '#F8FBF0',
          line: '#E3DDC6',
          ink: '#161B14',
          body: '#3A4237',
          muted: '#5C6658',
        },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
