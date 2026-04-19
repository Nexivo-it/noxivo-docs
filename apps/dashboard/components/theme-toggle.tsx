'use client';

import { useEffect, useState } from 'react';

const THEME_KEY = 'nf_theme';

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(true); // dark is default

  // On mount: read saved preference
  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY);
    const dark = saved ? saved === 'dark' : true; // default = dark
    setIsDark(dark);
    applyTheme(dark);
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    applyTheme(next);
    localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
  }

  function applyTheme(dark: boolean) {
    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="relative p-2 rounded-xl text-on-surface-muted hover:text-on-surface hover:bg-border-ghost transition-all group"
    >
      {/* Sun icon (shown in dark mode → switch to light) */}
      <span
        className={`material-symbols-outlined text-[20px] transition-all duration-300 absolute inset-2 flex items-center justify-center ${
          isDark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-75'
        }`}
      >
        light_mode
      </span>

      {/* Moon icon (shown in light mode → switch to dark) */}
      <span
        className={`material-symbols-outlined text-[20px] transition-all duration-300 absolute inset-2 flex items-center justify-center ${
          isDark ? 'opacity-0 -rotate-90 scale-75' : 'opacity-100 rotate-0 scale-100'
        }`}
      >
        dark_mode
      </span>

      {/* Invisible spacer to preserve button size */}
      <span className="material-symbols-outlined text-[20px] opacity-0 pointer-events-none">light_mode</span>
    </button>
  );
}
