# Style Guide

**Scope:** LINKD's **visual language** (colors, type, spacing, radius, accessibility) for the Expo app.

**Direction:** "Pink drink" - hot pink on midnight purple with butter-yellow stars. Girls-just-want-to-have-fun: candy-bright on a dark nightlife base. Tagline tone: "One press. Your people know."

**Implementation:** tokens live in one theme module in `apps/mobile/src/lib/theme/`; components read them through `useTheme()`, never as literals.

**Safety UI rules:** the SOS/cancel screens use the highest-contrast pair available (`text` on `bg`, 17.97:1), a cancel target of at least 88pt (`size.cancelTarget`), and never rely on color alone. The UI must stay usable one-handed and under stress. Lock-screen content is discreet by default.

---

## Overview

| Decision         | Value                                                        |
|------------------|--------------------------------------------------------------|
| Visual direction | Playful, candy-bright on a dark base ("Pink drink")          |
| Default mode     | Dark                                                         |
| Mode support     | Dark only                                                    |
| Primary font     | System (SF Pro on iOS, Roboto on Android) for all body + SOS |
| Display font     | Fredoka SemiBold, bundled at build time, headings only       |
| Monospace font   | System monospace (not used yet)                              |
| Accent color     | Hot pink `#FF4FA3`                                           |
| Border radius    | Generous and round (8 / 16 / 24 / pill)                      |
| Spacing density  | Generous                                                     |
| Icons            | Not chosen yet; decide with the first screen that needs one  |
| Accessibility    | WCAG AA hard constraint (4.5:1 text, 3:1 UI)                 |

Body and the SOS screen use the system font so nothing can fail to load in an emergency and Dynamic Type / font scaling works.

---

## Color Tokens

Semantic roles are the source of truth. Ratios are WCAG contrast against the background named in Notes.

| Role       | Token       | Value     | Notes                                                        |
|------------|-------------|-----------|--------------------------------------------------------------|
| Background | `bg`        | `#1B1033` | Midnight; app background                                     |
| Surface    | `surface`   | `#2A1B4D` | Cards, raised fields                                         |
| Border     | `border`    | `#7A66A8` | 3.67:1 on bg, 3.15:1 on surface (input outlines pass 3:1)    |
| Text       | `text`      | `#FFFFFF` | 17.97:1 on bg, 15.41:1 on surface                            |
| Text muted | `textMuted` | `#C9BFE0` | 10.28:1 on bg, 8.82:1 on surface                             |
| Accent     | `accent`    | `#FF4FA3` | Hot pink; 5.90:1 on bg, 5.06:1 on surface                    |
| On accent  | `onAccent`  | `#1B1033` | 5.90:1 on accent. **Never white on pink (3.04:1, fails)**    |
| Danger     | `danger`    | `#FF4D4D` | SOS and errors; 5.49:1 on bg, 4.71:1 on surface              |
| On danger  | `onDanger`  | `#1B1033` | 5.49:1 on danger (white is 3.27:1, large text only)          |
| Success    | `success`   | `#6EE7B7` | Mint; 11.79:1 on bg                                          |
| Warn       | `warn`      | `#FFE36E` | Butter; 14.09:1 on bg. Also the star color                   |
| Highlight  | `highlight` | `#FF8A3D` | Tangerine; 7.66:1 on bg. Decorative / secondary emphasis     |

**Pink vs red:** `accent` and `danger` are almost the same lightness (1.07:1 to each other), so they differ by hue only. The SOS control is therefore always a red fill **plus** a large "SOS" label and an icon; pink is for everyday actions and never for SOS.

---

## Typography

System font unless noted. Sizes are points and scale with the OS font size setting.

| Token | Size | Usage                                         |
|-------|------|-----------------------------------------------|
| xs    | 12   | Labels, timestamps, meta                      |
| sm    | 14   | Body secondary, captions                      |
| base  | 16   | Body primary                                  |
| lg    | 20   | Section headings, card titles                 |
| xl    | 24   | Page subheadings                              |
| 2xl   | 32   | Page headings (display font)                  |
| 3xl   | 48   | Wordmark / hero only (display font)           |

---

## Spacing

Scale: `xs` 4, `sm` 8, `md` 16, `lg` 24, `xl` 32.

| Context        | Token |
|----------------|-------|
| Page container | `lg`  |
| Card padding   | `md`  |
| Section gap    | `xl`  |
| Form field gap | `md`  |
| Inline gap     | `sm`  |

---

## Border Radius

Scale: `sm` 8, `md` 16, `lg` 24, `pill` 999.

| Component       | Token  |
|-----------------|--------|
| Cards, modals   | `lg`   |
| Buttons, inputs | `pill` |
| Badges, tags    | `pill` |
| Avatars         | `pill` |

---

## Components

| Primitive | Variant | Tokens                                     | Notes                              |
|-----------|---------|--------------------------------------------|------------------------------------|
| Button    | primary | `accent` fill, `onAccent` label            | one primary CTA per view           |
| Button    | sos     | `danger` fill, `onDanger` label + icon     | large "SOS" label; never pink      |
| Button    | ghost   | `border` outline, `text` label             |                                    |
| Badge     | warn    | `warn` fill, `bg` text                     | always with text, not color alone  |
| Badge     | success | `success` fill, `bg` text                  | always with text, not color alone  |
| Input     | default | `surface` fill, `border` outline, `text`   |                                    |

---

## Accessibility

- **WCAG AA** is a hard constraint - all color pairs must meet minimum contrast ratios.
- Normal text: 4.5:1 minimum. Large text (18px+ or 14px+ bold) and UI components: 3:1 minimum.
- All interactive elements must have a visible focus state.
- Icons used alone (no label) must have an accessible label.
- Color alone must never be the only indicator of state - always pair with text or icon.
