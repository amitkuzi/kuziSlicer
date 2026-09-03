import type { Config } from 'tailwindcss'

export default {
  content: ['./src/renderer/**/*.{js,jsx,ts,tsx}', './public/index.html'],
  theme: {
    extend: {
      colors: {
        ground: '#F4EFE7',
        raised: '#FFFFFF',
        base: '#221E1A',
        fg: '#221E1A',
        fg2: '#6E6357',
        fgOnBase: '#B5A797',
        ember: '#E4632D',
        emberInk: '#B8431A',
        brass: '#C9A227',
        onEmber: '#1A1210',
      },
      fontFamily: {
        display: ['Archivo', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        body: ['Public Sans', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config
