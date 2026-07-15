/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // Inter is the primary face; fall back to system UI fonts so
        // first-paint never depends on the network.
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"Segoe UI"',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
      },
      colors: {
        // Design system tokens — premium clinical SaaS palette
        canvas: '#FAFAFA',        // page background
        surface: '#FFFFFF',       // card backgrounds
        ink: '#222222',           // primary text
        muted: '#666666',         // secondary text
        rule: '#E8E8E8',          // borders / dividers
        accent: {
          DEFAULT: '#0B2447',     // brand accent (navy blue)
          hover: '#08192F',
          subtle: '#E7EBF2',      // navy tint for hover/active backgrounds
        },
      },
      borderRadius: {
        card: '12px',
        button: '10px',
        pill: '30px',
      },
      boxShadow: {
        // Extremely subtle — design system says no heavy shadows
        card: '0 1px 2px rgba(0, 0, 0, 0.03)',
        soft: '0 1px 3px rgba(0, 0, 0, 0.04)',
      },
      transitionDuration: {
        DEFAULT: '180ms',
      },
      keyframes: {
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.95)', opacity: '1' },
          '50%': { transform: 'scale(1.1)', opacity: '0' },
          '100%': { transform: 'scale(1.3)', opacity: '0' },
        },
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.5s infinite',
        'spin-slow': 'spin-slow 40s linear infinite',
        float: 'float 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

module.exports = config;
