# Lumina — Noxivo UI Design System

This document defines the mandatory UI rules for the **Lumina Premium Design System**. Lumina is built for high-performance SaaS interfaces that feel alive, depth-focused, and extremely premium.

## Core Philosophy: The Lucid Architect
Lumina moves away from flat "flat UI" into a world of depth, glassmorphism, and "Neural Glows".

- **Tonal Stacking**: Depth is created by lightening surfaces as they stack, not using heavy borders.
- **Ghost Borders**: Borders are semi-transparent and used sparingly (max 15% opacity).
- **Neural Glows**: Brand presence is felt through ambient glows and gradients, not solid color blocks.
- **Interactivity**: Every click or hover should feel tactile with micro-animations.

---

## Foundations

### 1. Color System
All colors MUST reference `apps/dashboard/app/tokens.css`. Never use raw hex values in components.

#### Brand Identity (Neural Colors)
- **Primary**: `#2563eb` (Blue) — Used for core focus and primary calls to action.
- **Secondary**: `#9333ea` (Purple) — Used for intelligence, AI features, and secondary accents.
- **Gradient**: `linear-gradient(135deg, #2563eb, #9333ea)` — Our signature "Sync Vector".

#### Surface Stacking (The "No-Line" Rule)
Surfaces indicate hierarchy through "lift" (lightness) rather than outlines.
- **Base**: `var(--surface-base)` — Pure background.
- **Section**: `var(--surface-section)` — Containers, sidebars, secondary panels.
- **Card**: `var(--surface-card)` — Highest elevation. Pure white in light mode, deep navy in dark mode.
- **Overlay**: `var(--surface-overlay)` — 80% opacity glass for modals and floating menus.

#### Borders & Shadows
- **Ghost Border**: `var(--border-ghost)` (10% opacity) — Use only where accessibility requires separation.
- **Ambient Shadow**: `var(--shadow-ambient)` — Broad, soft shadow for cards.
- **Primary Glow**: `var(--shadow-primary-glow)` — Blue/Purple glow used ONLY for focal points (Primary buttons, active indicators).

### 2. Typography
**Primary Font**: `Plus Jakarta Sans`, `Manrope`
**Mono Font**: `JetBrains Mono`

#### The Precision Scale
- **Display**: `text-4xl` (36px) / `text-5xl` (48px) — Used only for main landing or hero titles.
- **Section Heading**: `text-xl` (20px) / `text-2xl` (24px) — Black weight, tight tracking (`-0.05em`).
- **Body Large**: `text-[15px]` — The lead sentence or prominent text.
- **Body Standard**: `text-[13px]` — Default UI text for better information density.
- **Subtext/Label**: `text-[11px]` — Secondary hints or utility labels.

### 3. Iconic Voice
- **Library**: `lucide-react`
- **Rule**: Icons should be thin/light weight (`stroke-width={2}`).
- **Size**: 20px (default), 18px (dense sections), 24px (header features).

---

## Component Rules

### Interactive States
Every interactive element MUST implement:
- **Hover**: Subtle lift (`translate-y-[-1px]`), shadow increase, and border-glow.
- **Active**: Slight shrink (`scale-[0.98]`).
- **Glass Panel**: Use `.glass-panel` utility for backdrop-blur consistent with `tokens.css`.

### Touch Targets (Mobile)
- **Minimum**: 44px x 44px for all hit areas.
- **Spacing**: Use a 4px (base) or 8px (standard) grid. `px-4`/`py-4` is the default for UI blocks.

---

## Implementation Workflow for Agents
1. **Tokens First**: Check `tokens.css` before writing any CSS or Tailwind.
2. **Surface Check**: Is this component lighter than its background? If not, adjust surface token.
3. **No-Hard-Lines**: Can I use a tonal difference or a 10% ghost border instead of a solid #333 border?
4. **Wow Factor**: Does it have an entry animation (`animate-float-in`)? Does it have a hover state?
5. **Dark Mode**: Always verify both `<html>` and `<html class="dark">` representations.
