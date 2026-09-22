# Style Guide (template)

**Scope:** LINKD's **visual language** (colors, type, spacing, radius, accessibility) for the Expo app.

This is a **template** until branding is decided. Fill the token tables with real values; the structure and accessibility constraints stand.

**Implementation:** tokens live in one theme module in `apps/mobile/src/lib/theme/`; components read them through the theme hook, never as literals.

**Safety UI rules:** the SOS/cancel screens use the highest-contrast pair available, a cancel target of at least 88pt, and never rely on color alone. The UI must stay usable one-handed and under stress. Lock-screen content is discreet by default.

---

## Overview

| Decision         | Value                                        |
|------------------|----------------------------------------------|
| Visual direction | `<e.g. minimal / data-dense / playful>`      |
| Default mode     | `<light / dark>`                             |
| Mode support     | `<light / dark / both>`                      |
| Primary font     | `<font>`                                     |
| Monospace font   | `<font>`                                     |
| Accent color     | `<hex>`                                      |
| Border radius    | `<scale>`                                    |
| Spacing density  | `<compact / generous>`                       |
| Icons            | `<icon set>`                                 |
| Accessibility    | WCAG AA hard constraint (4.5:1 text, 3:1 UI) |

---

## Color Tokens

Define semantic roles (not raw colors) as the source of truth, then map each surface onto them. Hold every pair to WCAG AA.

| Role       | Token       | Value   | Notes                       |
|------------|-------------|---------|-----------------------------|
| Background | `bg`        | `<hex>` | app background              |
| Surface    | `surface`   | `<hex>` | cards, raised fields        |
| Border     | `border`    | `<hex>` | hairlines                   |
| Text       | `text`      | `<hex>` | primary text                |
| Text muted | `textMuted` | `<hex>` | secondary text              |
| Accent     | `accent`    | `<hex>` | primary action              |
| On accent  | `onAccent`  | `<hex>` | label/icon on accent fill   |
| Danger     | `danger`    | `<hex>` | errors, destructive actions |
| Success    | `success`   | `<hex>` | positive signal             |
| Warn       | `warn`      | `<hex>` | caution signal              |

---

## Typography

### Scale

| Token | Usage                         |
|-------|-------------------------------|
| xs    | Labels, timestamps, meta      |
| sm    | Body secondary, captions      |
| base  | Body primary                  |
| lg    | Section headings, card titles |
| xl    | Page subheadings              |
| 2xl   | Page headings                 |
| 3xl+  | Hero / display text only      |

---

## Spacing

| Context        | Token   |
|----------------|---------|
| Page container | `<...>` |
| Card padding   | `<...>` |
| Section gap    | `<...>` |
| Form field gap | `<...>` |
| Inline gap     | `<...>` |

---

## Border Radius

| Component       | Token   |
|-----------------|---------|
| Cards, modals   | `<...>` |
| Buttons, inputs | `<...>` |
| Badges, tags    | `<...>` |
| Avatars         | `<...>` |

---

## Components

Document the component taxonomy here - the canonical list of variants per primitive (button tones, badge variants, etc.) and the token each maps to. The role protocols defer to this section, so keep it the single source for component styling.

| Primitive | Variants           | Notes                    |
|-----------|--------------------|--------------------------|
| Button    | `<primary / ... >` | one primary CTA per view |
| Badge     | `<...>`            |                          |
| Input     | `<...>`            |                          |

---

## Accessibility

- **WCAG AA** is a hard constraint - all color pairs must meet minimum contrast ratios.
- Normal text: 4.5:1 minimum. Large text (18px+ or 14px+ bold) and UI components: 3:1 minimum.
- All interactive elements must have a visible focus state.
- Icons used alone (no label) must have an accessible label.
- Color alone must never be the only indicator of state - always pair with text or icon.
