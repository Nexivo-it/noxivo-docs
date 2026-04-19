/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  // Enable class-based dark mode (controlled by <html class="dark">)
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Brand (same in both modes — never changes) ──────────────
        primary:   'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        success:   'var(--color-success)',
        warning:   'var(--color-warning)',
        error:     'var(--color-error)',

        // ── Semantic surface tokens ──────────────────────────────────
        surface: {
          base:     'var(--surface-base)',
          section:  'var(--surface-section)',
          low:      'var(--surface-low)',
          card:     'var(--surface-card)',
          overlay:  'var(--surface-overlay)',
        },

        // ── Text tokens ──────────────────────────────────────────────
        'on-surface':        'var(--on-surface)',
        'on-surface-muted':  'var(--on-surface-muted)',
        'on-surface-subtle': 'var(--on-surface-subtle)',
        'on-surface-inverse':'var(--on-surface-inverse)',

        // ── Border tokens ────────────────────────────────────────────
        border: {
          ghost: 'var(--border-ghost)',
          focus: 'var(--border-focus)',
          input: 'var(--border-input)',
        },

        // ── Legacy aliases (keep for backward compatibility with existing components) ──
        'bg-primary':   'var(--surface-base)',
        'bg-surface':   'var(--surface-section)',
        'text-primary': 'var(--on-surface)',
        'text-muted':   'var(--on-surface-muted)',
        'status-success': 'var(--color-success)',
        'status-warning': 'var(--color-warning)',
        'status-error':   'var(--color-error)',
        'brand-500':      'var(--color-primary)',
        'brand-400':      'var(--color-primary)',
        'border-default': 'var(--border-ghost)',
      },

      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans:    ['var(--font-display)', 'system-ui', 'sans-serif'],
        mono:    ['var(--font-mono)', 'monospace'],
      },

      borderRadius: {
        xs:   'var(--radius-xs)',
        sm:   'var(--radius-sm)',
        md:   'var(--radius-md)',
        lg:   'var(--radius-lg)',
        xl:   'var(--radius-xl)',
        '2xl':'var(--radius-2xl)',
        full: 'var(--radius-full)',
      },

      boxShadow: {
        ambient:  'var(--shadow-ambient)',
        card:     'var(--shadow-card)',
        float:    'var(--shadow-float)',
        glow:     'var(--shadow-primary-glow)',
      },

      transitionDuration: {
        fast:   '150',
        normal: '250',
        slow:   '400',
      },

      backgroundImage: {
        'gradient-brand': 'var(--gradient-brand)',
        'gradient-hero':  'var(--gradient-hero)',
      },
    },
  },
  plugins: [],
};
