/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
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
    },
  },
  plugins: [],
}
