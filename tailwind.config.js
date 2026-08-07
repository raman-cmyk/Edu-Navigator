/** @type {import('tailwindcss').Config} */
// Tokens are the source of truth in src/styles/tokens.css. Tailwind maps to the
// CSS custom properties so classes and raw CSS never drift apart.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    // Deliberately no default color palette — only the design-system tokens.
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      ink: 'var(--ink)',
      'ink-soft': 'var(--ink-soft)',
      stone: 'var(--stone)',
      rule: 'var(--rule)',
      paper: 'var(--paper)',
      surface: 'var(--surface)',
      sunk: 'var(--sunk)',
      blaze: 'var(--blaze)',
      'blaze-weak': 'var(--blaze-weak)',
      verified: 'var(--verified)',
      student: 'var(--student)',
      agent: 'var(--agent)',
      focus: 'var(--focus)',
      white: '#FFFFFF',
    },
    borderRadius: {
      none: '0',
      sm: 'var(--r-sm)', // 3px
      md: 'var(--r-md)', // 6px
      full: '9999px',
    },
    boxShadow: {
      none: 'none',
      DEFAULT: 'var(--shadow)',
    },
    fontFamily: {
      display: 'var(--font-display)',
      body: 'var(--font-body)',
      data: 'var(--font-data)',
    },
    fontSize: {
      display: ['var(--t-display-size)', { lineHeight: '1.15' }],
      h1: ['var(--t-h1-size)', { lineHeight: '1.25' }],
      h2: ['var(--t-h2-size)', { lineHeight: '1.3' }],
      body: ['var(--t-body-size)', { lineHeight: 'var(--t-body-lh)' }],
      small: ['var(--t-small-size)', { lineHeight: '1.5' }],
      micro: ['var(--t-micro-size)', { lineHeight: '1.4' }],
      data: ['var(--t-data-size)', { lineHeight: '1.4' }],
    },
    extend: {
      spacing: {
        s1: 'var(--s1)',
        s2: 'var(--s2)',
        s3: 'var(--s3)',
        s4: 'var(--s4)',
        s5: 'var(--s5)',
        s6: 'var(--s6)',
        s7: 'var(--s7)',
        s8: 'var(--s8)',
      },
      maxWidth: {
        content: '680px',
      },
    },
  },
  plugins: [],
};
