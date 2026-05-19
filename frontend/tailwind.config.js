/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2D5A27',
          50:  '#F0F5EF',
          100: '#D8E9D6',
          200: '#B2D3AD',
          300: '#8BBD84',
          400: '#65A75B',
          500: '#2D5A27',
          600: '#254A20',
          700: '#002201',
          800: '#132910',
          900: '#0A1808',
        },
        secondary: {
          DEFAULT: '#6B705C',
          50:  '#F4F4F1',
          100: '#E2E3DB',
          200: '#C5C7B7',
          300: '#A8AB93',
          400: '#8B8F6F',
          500: '#6B705C',
          600: '#575A4A',
          700: '#434537',
          800: '#2F3025',
          900: '#1A1B12',
        },
        tertiary: {
          DEFAULT: '#A5A58D',
        },
        neutral: {
          DEFAULT: '#45494E',
          50:  '#F5F5F6',
          100: '#E3E4E6',
          200: '#C7C9CC',
          300: '#AAADB2',
          400: '#8E9197',
          500: '#45494E',
          600: '#383B3F',
          700: '#2A2C30',
          800: '#1C1E20',
          900: '#0E0F10',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
      'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
      fadeIn: {
        '0%':   { opacity: '0', transform: 'translateY(8px)' },
        '100%': { opacity: '1', transform: 'translateY(0)' },
        }
      },
    },
  },
  plugins: [],
}