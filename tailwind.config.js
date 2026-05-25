/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#f97316',   // orange-500
          hover: '#fb923c',     // orange-400
          light: '#fdba74',     // orange-300
          dark: '#ea580c',      // orange-600
        },
        accent: {
          DEFAULT: '#f59e0b',   // amber-500
          hover: '#fbbf24',     // amber-400
          light: '#fcd34d',     // amber-300
          dark: '#d97706',      // amber-600
        },
        surface: {
          950: '#120e0a',       // warm near-black
          900: '#1c1612',       // warm dark
          800: '#292018',       // warm dark elevated
          700: '#3d3024',       // warm border
          600: '#514432',       // warm border hover
        }
      },
      fontFamily: {
        display: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
      }
    }
  },
  plugins: []
}
