import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#001336',
          hover:   '#00204F',
          light:   '#E8EBF2', // tint pour states sélectionnés
        },
        gold: {
          DEFAULT: '#FFBF1C',
          hover:   '#E6AB00',
          light:   '#FFF9E6',
        },
        charcoal: '#1A1A1A',
        neutral:  '#F5F5F5',
      },
      fontFamily: {
        heading: ['var(--font-montserrat)', 'Montserrat', 'sans-serif'],
        body:    ['var(--font-inter)', 'Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
