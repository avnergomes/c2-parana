// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Design system C2 Paraná
        background: {
          DEFAULT: '#0a0a0f',
          secondary: '#0f1117',
          card: '#111827',
          elevated: '#1a2030',
        },
        accent: {
          green: '#10b981',
          'green-dim': '#065f46',
          blue: '#3b82f6',
          'blue-dim': '#1e3a5f',
        },
        status: {
          danger: '#ef4444',
          warning: '#f59e0b',
          info: '#3b82f6',
          success: '#10b981',
        },
        text: {
          primary: '#f9fafb',
          secondary: '#9ca3af',
          muted: '#4b5563',
        },
        border: {
          DEFAULT: '#1f2937',
          subtle: '#111827',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1rem' }],
      },
      transitionDuration: {
        DEFAULT: '120ms',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-in': 'slideIn 0.15s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateX(-8px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.6)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.6)',
        glow: '0 0 12px rgba(16,185,129,0.3)',
      },
      borderRadius: {
        card: '8px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
}

export default config
