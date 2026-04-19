export const colors = {
  amber: {
    50: '#FAF5E8',
    100: '#F5E9C8',
    200: '#EDD490',
    300: '#F5C842',
    400: '#D4A04A',
    500: '#B8852F',
    600: '#96681E',
    700: '#7A5215',
    800: '#573A0E',
    900: '#3D2809',
    950: '#2B1F0F',
  },
  indigo: {
    50: '#F3EFFA',
    100: '#E2D8F5',
    200: '#C4B1EB',
    300: '#9B7FD4',
    400: '#7A57BE',
    500: '#5E3DA0',
    600: '#4C2A85',
    700: '#3C1F6B',
    800: '#2A1450',
    900: '#1C0C38',
    950: '#160B28',
  },
  neutral: {
    50: '#FAF7F2',
    100: '#F0EBE1',
    200: '#DDD4C5',
    300: '#C8BBAA',
    400: '#A89A87',
    500: '#8A7E70',
    600: '#6E6358',
    700: '#544A40',
    800: '#3C342A',
    900: '#2A231A',
    950: '#1A1816',
  },
  semantic: {
    success: '#3E8E7E',
    warning: '#D4A04A',
    error: '#C25450',
    info: '#7A57BE',
  }
} as const;

export const typography = {
  fonts: {
    heading: ['Fraunces', 'Georgia', 'serif'],
    body: ['Inter', 'sans-serif'],
    mono: ['JetBrains Mono', 'monospace'],
  }
} as const;
