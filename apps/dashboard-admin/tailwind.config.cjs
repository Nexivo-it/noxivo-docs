/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'primary': 'var(--color-primary)',
        'secondary': 'var(--color-secondary)',
        'surface-base': 'var(--surface-base)',
        'surface-section': 'var(--surface-section)',
        'surface-card': 'var(--surface-card)',
        'on-surface': 'var(--on-surface)',
        'on-surface-muted': 'var(--on-surface-muted)',
        'border-ghost': 'var(--border-ghost)',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      borderRadius: {
        'nx': 'var(--radius-md)',
        'nx-lg': 'var(--radius-lg)',
      },
    },
  },
  plugins: [],
}
