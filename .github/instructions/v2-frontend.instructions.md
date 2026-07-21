---
applyTo: "src/v2/**"
---

# V2 Frontend Instructions — Glassmorphism × Bento

## Scope

These instructions govern the **V2 surface** under `src/v2/**` only. V2 is fully isolated
from V1: it does **not** import any V1 asset (`.glass`, `app-card`, `--glass-*`), and V1
must not consume V2 tokens or classes. The design language is **Bento Grid architecture ×
Glassmorphism (frosted glass)** — an all-in-one developer & AI engineering console: a deep
gradient backdrop showing through translucent, `backdrop-filter`-blurred surfaces.

## Stack & Structure

- Next.js App Router with React client components (`'use client'` at the top of any file
  using state, effects, context, or browser APIs).
- Styling is **pure CSS** in `src/v2/styles/globals.css`, scoped under `.v2-root`. Do not
  introduce Tailwind utility soup, CSS-in-JS, or per-component `<style>` blocks for V2.
- Keep the layered structure: `app/` (entry) · `components/` (ui + layout + modules) ·
  `features/` (domain + application logic + contexts) · `hooks/` · `services/` · `lib/`.
- All Tauri calls stay behind `src/v2/services/tauriBridge.ts`. Presentation components
  consume `features/*/application/*` hooks or `features/*/*Context.tsx`, never `invoke`.

## Design Tokens (authoritative)

All tokens are defined in `globals.css` under `.v2-root` and the two theme maps. **Dark is
the default theme** (deep `#0d1117` gradient); a lighter frosted variant is selected via
`data-v2-theme="light"` (owned by `features/theme/ThemeContext.tsx`).

- Surfaces are **translucent** (`--v2-surface*` = semi-transparent white) over the page
  gradient; depth comes from **backdrop blur + drop shadow + a 1px highlight edge** baked
  into the shadow tokens. Never hard-code hex/rgba surfaces or `box-shadow` values in
  components, and never hard-code `backdrop-filter` — use `--v2-glass-blur`.
- Use these shadow tokens for every raised/recessed surface (each already includes the
  glass hairline edge via an `inset 0 0 0 1px` highlight):
  - `--v2-shadow-extruded` / `--v2-shadow-extruded-sm` — raised (buttons, cards, badges).
  - `--v2-shadow-recessed` / `--v2-shadow-recessed-sm` — inset (inputs, tracks, wells).
  - `--v2-shadow-hover` — brighter edge + deeper lift on hover.
- Radii: `--v2-radius-md` (nested), `--v2-radius-lg` (panels/terminal),
  `--v2-radius-xl` (Bento cards), `--v2-radius-full` (pills/switches/meters).
- Spacing uses the `--v2-space-*` 4px scale; the Bento gap is `--v2-space-6` (24px).
- Text: `--v2-text-strong` (titles), `--v2-text` (body), `--v2-text-muted` (labels),
  `--v2-text-subtle` (captions/eyebrows). Monospace via `--v2-font-mono`.
- Semantic accents (accents only — borders, LEDs, small fills, active text):
  `--v2-accent-ssh` (emerald), `--v2-accent-rdp` (blue), `--v2-accent-vector` (purple),
  `--v2-accent-warn` (amber), `--v2-accent-danger` (rose), plus `--v2-primary`.

## Glassmorphism Rules

- A surface is either **extruded** (raised glass panel) or **recessed** (inset well) — pick
  one per element and keep it consistent with its interaction: inputs/tracks/wells are
  recessed; cards, buttons, badges, and knobs are extruded.
- Any translucent surface that overlays the gradient must carry `backdrop-filter:
  blur(var(--v2-glass-blur))`. Add new glass surfaces to the shared blur group near the
  top of the Components section rather than per-component.
- Pressed/active states invert: extruded controls adopt `*-recessed-sm` on `:active` or
  when selected (e.g. active nav item, active segmented button, active pill).
- The glass edge (1px highlight) comes from the shadow tokens — do **not** add a separate
  `border` to outline a card. A flat `--v2-border` is allowed only for table row dividers
  and hairline separators.
- Keep surfaces readable: translucent fills plus blur, never fully opaque hero panels.
- Respect `prefers-reduced-motion` (already handled globally); do not add motion that
  bypasses it.

## Bento Layout

- Compose module pages with `BentoGrid` + `BentoCard` from `components/ui/Bento.tsx`.
- `BentoGrid` is a 4-column grid by default (`columns={3}` for Settings). Cards declare
  their footprint with `span` = `1x1 | 2x1 | 3x1 | 4x1 | 1x2 | 2x2 | 3x2`.
- Give each `BentoCard` a `label` (eyebrow) and optional `action` (right-aligned control).
- Nested blocks inside a card use `.v2-surface-block` (recessed well) — do **not** nest a
  full `.v2-card` inside another card.
- Every module follows the pattern: `.v2-module` > `.v2-module__head` (title + toolbar) >
  `BentoGrid`. Keep density high and desktop-tool oriented; no marketing hero sections.

## Component Library (use these, don't reinvent)

Located in `src/v2/components/ui/`:

- Layout: `BentoGrid`, `BentoCard`; primitives `Card`, `Button`, `Badge`, `Input`/`Field`,
  `Stat`.
- Controls: `Segmented` (ProtocolToggle SSH/RDP), `Switch` (FeatureToggle),
  `TactileSlider` (hyperparameters), `SecretInput` (masked API keys), `Pill` (filters).
- Data & feedback: `CircularMeter` + `Track` (metrics), `TerminalWindow` (recessed dark
  console, `--v2-terminal-bg` #0D1117), `Led` (status dots), `ToastProvider`/`useToast`
  (neumorphic toasts).
- Visualization: `components/modules/ChunkScatterMap.tsx` (Canvas 2D vector cloud with
  hover-KNN, click-to-select, zoom/pan).
- Icons come from `components/ui/icons.tsx` (stroke = `currentColor`). Add new icons there;
  do not inline one-off SVGs in modules.

When a needed pattern is missing, add a reusable component in `components/ui/` with a
`.v2-`-prefixed class in `globals.css`, rather than styling inline.

## Modules

Three module views live in `components/modules/`, routed by `layout/AppShell.tsx` /
`navConfig.ts` (`remote | rag | settings`):

- `RemoteMachineModule` — Hero machine status (2x2), Protocol Monitor (1x2), Script
  Execution engine + `TerminalWindow` (2x1), Machine inventory CRUD table (2x1). Wired to
  `features/remote/application/useRemoteProfiles`.
- `RagManageModule` — KB status (1x1), FileDropZone ingestion (2x1), `ChunkScatterMap`
  (3x2), Chunk Inspector (1x2), Document list (4x1). Wired to `hooks/usePipelineStats` and
  `features/vector-stars/useVectorData`.
- `SettingsModule` — Model providers + sliders (2x1), DB connector (1x1), System prefs +
  theme (1x1), Future modules (2x1). Wired to `features/models/ModelProvidersContext` and
  `features/theme/ThemeContext`.

Backend calls degrade silently outside Tauri; modules must stay fully visible and
interactive with sensible demo data when no backend is present.

## Interaction & Accessibility

- Icon-only buttons require `aria-label` (and `title` where helpful).
- Toggles/switches use `role="switch"` + `aria-checked`; segmented uses `role="tab"` +
  `aria-selected`; meters use `role="meter"` with `aria-valuenow/min/max`.
- Use stable dimensions for controls so theme/state changes never shift layout.
- Do not rely on color alone for state — pair accent color with a `Led`, `Badge`, or text.
- Keep text from overflowing cards/pills/rows via wrapping or truncation.

## Verification

Before finishing V2 changes:

1. New/modified surfaces use `--v2-shadow-*` tokens (extruded or recessed) — no hard-coded
   `box-shadow`, hex backgrounds, borders-as-outline, or `backdrop-blur`.
2. Toggle the theme (`浅色` / `深色`) in Settings and confirm both neumorphic variants read
   correctly (shadows, contrast, accents).
3. Confirm Bento cards keep consistent `span`, gap, radius, and `label`/`action` structure
   across all three modules.
4. Run `npm run lint` when possible; run `npm run build` when touching `globals.css`, the
   app shell, or shared `components/ui`.
