# Mira Terminal design system

Dark only (light theme later, on the same tokens). Compact density, like Linear. Inspired by Vercel: pure black, hairline borders, white text, no accent colour (white is the accent). All UI copy is in English, short, sentence case. Never uppercase: section labels are sentence case, like Claude's sidebar ("Projects", "Recent").

## Colour

One black everywhere. Depth comes from 1px borders (`line`, `line-strong`), never from grey fills. Greys only show hover, selection and pressed states. Colour is for states only (ok, warn, bad) and the agents' own marks (Claude orange); no blue.

| Token | Value | Use |
|---|---|---|
| `bg` | `#000000` | every surface : app, sidebar, bars, panels, menus, popovers, toasts, terminal, map |
| `surface-1` | `#0a0a0a` | hover on large tiles, map blocks |
| `surface-2` | `#111111` | hover, inputs, active tab chip |
| `surface-3` | `#171717` | pressed |
| `line` | `#1f1f1f` | default 1px borders, separators |
| `line-strong` | `#2e2e2e` | input borders, hovered cards, chips |
| `text` | `#ededed` | primary text |
| `text-2` | `#a1a1a1` | secondary text, inactive tabs |
| `text-3` | `#6b6b6b` | labels, placeholders, meta |
| `accent` | `#ededed` | primary buttons, focus, selection (neutral white, no colour) |
| `accent-hover` | `#ffffff` | primary button hover |
| `accent-text` | `#000000` | text on primary buttons |
| `accent-soft` | `rgba(255,255,255,.07)` | selected row, selected card background |
| `accent-line` | `rgba(255,255,255,.35)` | selected card border |
| `chrome` | `#000000` | sidebar and status bar (pure black) |
| `ok` | `#45dd8a` | healthy, done |
| `warn` | `#f5a524` | degraded, limit close |
| `bad` | `#f26b6b` | down, error, limit reached |

Colour carries meaning only: green, amber, red = state. Everything else is black, greys and white. No gradients, no glow, no blur, no coloured shadows.

## Type

Font: `"Geist Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`. Code and terminal: `Menlo, Monaco, "Courier New", monospace` (Chromium cannot use `ui-monospace` in canvas).

| Token | Size / line height | Weight | Tracking | Use |
|---|---|---|---|---|
| `label` | 12 / 16 | 500 | 0, sentence case | section labels, group names, status bar tags |
| `meta` | 12 / 16 | 400 | 0 | secondary info, chips, tooltips |
| `body` | 13 / 20 | 400 | 0 | default text, rows, buttons |
| `strong` | 13 / 20 | 500 | 0 | row titles, active items |
| `title` | 16 / 24 | 600 | `-.01em` | panel and dialog titles |
| `heading` | 20 / 28 | 600 | `-.02em` | page titles |
| `display` | 40 / 42 | 600 | `-.045em` | welcome screen only |

Numbers that change (usage, counts, prices) use `font-variant-numeric: tabular-nums`.

## Space and size

4px grid: `4, 8, 12, 16, 24, 32, 48`.

| Element | Size |
|---|---|
| title bar and every tab strip | 40px high (macOS traffic lights at x 14, y 14) |
| status bar | 28px |
| sidebar | 240px wide, 12px side padding |
| row (list item, menu item) | 28px, 8px horizontal padding |
| control small / default | 24px / 28px high |
| tab | 32px high, in a 40px strip : 8px above it in every pane, top or bottom |
| icon | 14px in rows and buttons, 16px for primary actions, stroke 1.75 |
| panel padding | 16px |
| dialog | 480px wide, 24px padding |

## Layout

Pages use the full width, like Vercel: a 24px gutter, no centred column, no max width on lists, cards and settings. Only near-empty screens (the welcome page, an empty state inside a card) centre their content.

## Shape

Radius: `4` chips and small controls, `6` buttons, inputs, rows, tabs, `8` cards and panels, `12` dialogs, `999` pills and status dots. Borders are always 1px. Shadows only on floating layers (menus, dialogs): `0 8px 24px rgba(0,0,0,.5)`, no blur filters.

## Components

- **Primary button**: accent (white) background, `accent-text` (black) text, 28px. Hover `accent-hover`. Disabled: `surface-2` background, `text-3` text (shown greyed in advance, never hidden).
- **Secondary button**: transparent, `line-strong` border, `text` colour; hover `surface-2`.
- **Ghost / icon button**: no border, `text-2`; hover `surface-2` + `text`.
- **Input**: `surface-2`, `line-strong` border, 28px; focus border `accent`.
- **Row**: 28px, `text-2`; hover `surface-2` + `text`; selected `accent-soft` + `text`.
- **Tab**: 32px, `text-2`, top corners radius 6. Active: outlined with a 1px `line` border on top and sides, `bg` background, no bottom border, so it flows into the content below (the strip line never shows under it); `text` colour, `text-2` when its pane is not the focused one.
- **Card (map block)**: `surface-1`, `line` border, radius 8; hover `line-strong`; selected `accent-line` border + `accent-soft` background.
- **Chip / status**: radius 4, `line-strong` border, `meta` size; state chips use the state colour for the dot and text.
- **Toast**: bottom centre, `surface-3`, `line-strong` border, one short line, 2.5 s.

## Motion

Hover and press: 120ms ease-out on colour and border only. Panels and tabs: 180ms `cubic-bezier(.2,.7,.2,1)` on transform and opacity. Nothing bounces, nothing blurs.

## Copy

English, sentence case, as short as possible ("Open folder", "Clone", "Initialize git"). No explanation sentences under titles. No middle dots as separators.
