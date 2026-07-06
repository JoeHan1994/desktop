# Frontend Instructions

## Scope

These instructions apply to the frontend in this Next.js + Tauri desktop app.

The app should read as a compact desktop AI workspace: dark, spatial, glass-based, data-dense, and tool-first. Do not turn app screens into marketing pages, hero sections, or oversized card showcases.

## Stack

- Use Next.js App Router and React client components for interactive UI.
- Use Tailwind CSS for layout and component styling.
- Use Framer Motion for entrance, hover, tap, streaming, and compact state transitions.
- Use React Three Fiber, Three.js, and drei for 3D scenes and materials.
- Keep Tauri API calls isolated behind service/context helpers instead of calling them directly from presentation components.

## Page Design Language

- Keep every menu page visually synchronized with the same global glass/card vocabulary, while allowing each page to choose its own grid, density, and card size.
- Preserve the desktop-tool layout pattern: sidebar navigation, compact top action area, scrollable work surfaces, and dense information panels.
- Use restrained radii and spacing for application surfaces: prefer `rounded-2xl` for primary panels, `rounded-xl` for nested metric/detail blocks, and tighter padding for repeated rows.
- Avoid nested full cards inside other full cards. Use one top-level `app-card` surface and `app-card-surface` for internal metric tiles, metadata blocks, chips, rows, and detail summaries.
- Avoid one-off card backgrounds per page. If a card, panel, tile, list row, or message bubble needs a surface, use the global helpers from `src/app/globals.css`.
- Do not use landing-page composition, oversized hero typography, decorative card grids, or explanatory feature text inside app screens.
- Keep headings compact: page titles can be prominent, but card titles, panel labels, metadata, and row text should stay small enough for repeated operational use.
- Keep key data visible without horizontal layouts that hide detail. Prefer responsive grids, scrollable columns, and stacked internal details when information density grows.

## Global Glass System

- All visible frontend controls, panels, cards, tiles, inputs, buttons, selectors, popovers, message bubbles, and list rows should use the global `.glass` class or a `.glass`-based helper class.
- The global glass variables are owned by `ThemeProvider` and defined in `src/app/globals.css`:
  - `--glass-alpha`
  - `--glass-blur`
  - `--glass-saturate`
  - `--glass-border-alpha`
  - `--glass-radius`
- Shared glass/card helpers also live in `src/app/globals.css` and must stay variable-driven:
  - `app-card` for primary cards, panels, list groups, message containers, and menu-page work surfaces.
  - `app-card-surface` for nested metric blocks, metadata panels, row details, chips, counters, and low-emphasis internal surfaces.
  - `app-card-glow` for the neutral inner glow used by reusable cards.
  - `app-card-control` for hover treatment on clickable cards and rows.
- Prefer these class combinations for new controls:
  - `glass app-card` for primary cards, list groups, panels, tiles, and generic page surfaces.
  - `glass app-card app-card-control glass-control` for clickable cards, selectable list rows, and drop targets.
  - `app-card-surface` for nested non-focusable surfaces inside a primary card.
  - `glass app-card-surface app-card-control glass-control` for clickable nested rows or secondary controls.
  - `glass glass-input` for input wrappers and focusable input surfaces.
  - `glass glass-button glass-control` for text buttons.
  - `glass glass-icon-button glass-control` for icon-only buttons.
  - `glass glass-chip` or `glass-chip app-card-surface` for badges, pills, and compact labels.
  - `glass-track` for progress tracks and low-emphasis meter backgrounds.
- Do not hard-code `backdrop-blur-*`, `bg-white/[...]`, `bg-black/...`, or glass-like `border-white/...` for controls when a `.glass`, `app-card`, or `app-card-surface` helper can provide the same surface.
- Decorative separators, animated background lights, status dots, SVG strokes, and primary data-visualization colors do not need `.glass`.
- Keep accent colors as accents only: borders, text, small status dots, fills inside progress bars, and active indicators may use `--accent-rgb` or provider-specific colors.
- Keep all card opacity, border strength, blur, and saturation responsive to the appearance controls by using CSS variables instead of fixed Tailwind background opacity.

## Cross-Menu Card Consistency

- `设置`, `AI 对话`, `RAG 检索`, and `Knowledge Base Manager` must use the same card language: `glass app-card` for outer panels and `app-card-surface` for internal information blocks.
- Card sizes, column spans, and content density may differ by page, but background color, border strength, hover treatment, glow, and nested-surface styling must stay synchronized.
- Reusable cards should go through `src/components/ui/GlassCard.tsx` when the layout matches its title/subtitle/badge pattern.
- When building new menu views in `src/components/views/Views.tsx`, match existing `app-card` and `app-card-surface` usage before introducing new surface classes.
- Clickable file rows, source cards, chunk cards, provider rows, and selectable results should combine `app-card-control` with `glass-control` so hover and focus behavior is consistent.
- Progress meters should use `glass-track` or an `app-card-surface` track with accent-colored fills only inside the meter.

## Knowledge Base Manager Layout

- Keep the Knowledge Base Manager page information-rich and readable: upload/files, chunk review, metadata audit, vectorization status, and pipeline stages should all remain visible as distinct work areas.
- Prefer a responsive multi-column desktop layout, with stacked mobile behavior, instead of long horizontal rows that hide each feature's details.
- File cards should show filename, format, size, parse status, chunk count, and token count in compact but readable blocks.
- Chunk cards should expose chunk index, preview text, token count, and metadata chips without forcing the user to open a backend panel.
- Pipeline and vectorization stages should use compact status cards, progress tracks, small metrics, and code/metadata summaries on `app-card-surface` blocks.

## RAG And Assistant Layout

- RAG pages should preserve the retrieval workflow: query area, source/result cards, retrieval settings, prompt contract, and index health should share the same card vocabulary.
- Assistant pages should keep chat/message surfaces, side panels, token/streaming metrics, and action rows aligned with the global card style.
- Message bubbles and operational rows should remain compact, readable, and stable when theme settings change.

## Appearance Configurator Exception

- `src/features/theme/ThemeConfigurator.tsx` is intentionally excluded from global `.glass` conversion.
- The appearance panel should remain visually stable while the user edits glass settings, so its own container and internal controls may keep their fixed dark panel styling.
- Do not apply `.glass`, `.glass-control`, `.glass-input`, `.glass-button`, or `.glass-chip` inside `ThemeConfigurator` unless the product requirement changes.

## 3D And Visual Performance

- Use Three.js/R3F for 3D scenes, not DOM glass classes.
- Do not apply `.glass` to Three.js mesh components such as `GlassPanel`; connect visual parity through props or theme-derived material parameters only when explicitly needed.
- Avoid stacking many translucent DOM layers over active WebGL canvases.
- Keep animated glass surfaces lightweight and prefer CSS variables over per-component inline filter values.

## Interaction And Layout

- Icon-only controls should have `aria-label` or `title` when the icon is not self-explanatory.
- Preserve compact desktop-tool density: avoid oversized marketing-style sections for app screens.
- Use stable dimensions for icon buttons, chips, progress bars, selectors, message bubbles, and input bars so theme changes do not cause layout jumps.
- Keep text readable against dynamic backgrounds and avoid relying on color alone for critical state.
- Use Lucide icons through the existing icon system for recognizable actions instead of manual SVGs when an icon already exists.
- Keep text inside buttons, chips, cards, and list rows from overflowing; use wrapping, truncation, or responsive layout changes where needed.
- Do not let hover states, active states, badges, token counts, or progress labels resize the surrounding layout.

## Verification

Before finishing frontend changes:

1. Confirm new or modified controls outside `ThemeConfigurator` include `.glass`, `app-card`, `app-card-surface`, or another `.glass`-based helper.
2. Move the appearance sliders for glass opacity, blur, saturation, border strength, and radius, and verify major UI controls respond globally.
3. Compare `设置`, `AI 对话`, `RAG 检索`, and `Knowledge Base Manager` after card changes to ensure the same surface style is used across menus.
4. Run `npm run lint` when possible.
5. Run `npm run build` or a dev server check when the change touches shared UI, app shell behavior, or global CSS.
