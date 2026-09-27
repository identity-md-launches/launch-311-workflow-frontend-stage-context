# DESIGN.md: Noughts tic-tac-toe (lab-tictactoe)

Documentation of the design as implemented in `web/src/styles.css` and the components under
`web/src/components/`, written after the final source change. The repository root is outside this
assignment's write scope, so the document lives here in `docs/`.

## Overview

A single-page tool for players of a Sepolia test game. The audience is a wallet user who wants to
open or join a game, play, and collect NGHT; nothing is sold or promoted. The visual character is a
quiet, warm-neutral utility: one light theme, system fonts, white cards on an off-white page, one
blue accent reserved for the next action and for links, and text-first status cues. Density is
moderate: 16px body text, 44px controls, 16px card padding on narrow screens and 24px from 40rem.

System-wide rules: every section is a card with an `h2`; controls are native elements with a
visible border or fill; status is always text plus a glyph, never color alone; changing numbers use
tabular figures. Page-specific arrangement (which card sits in which column) is not a rule.

## Colors

All colors are hex custom properties on `:root` in `web/src/styles.css`. Components only reference
semantic tokens; there is no primitive tier because the palette is small enough to be role-named
directly.

| Token | Value | Job |
| --- | --- | --- |
| `--color-bg-page` | `#f6f5f2` | page background, disabled empty board cells |
| `--color-bg-surface` | `#ffffff` | cards, inputs, buttons, board cells |
| `--color-bg-subtle` | `#eeece7` | board tray, badges, disabled buttons, selected game row |
| `--color-bg-hover` | `#e6e3dc` | hover on playable cells |
| `--color-border` | `#d8d4cc` | structural separators: card-row borders, disabled cells, footer rule |
| `--color-border-strong` | `#8f8a80` | control boundaries: buttons, inputs, playable cells (3.43:1 on white) |
| `--color-text` | `#1c1b18` | headings, body, board marks, winning-line border |
| `--color-text-secondary` | `#5a564e` | labels, hints, muted copy (6.19:1 on `--color-bg-subtle`, 7.30:1 on white) |
| `--color-accent-solid` / `--color-accent-hover` | `#1d55a8` / `#174487` | the one filled primary action per view, links |
| `--color-accent-text` | `#ffffff` | text on the accent fill (7.20:1) |
| `--color-focus` | `#1d55a8` | 2px focus outline with 2px offset |
| `--color-danger-*` | text `#9a2626`, bg `#fbecec`, border `#e3b4b4` | error notices, invalid input border and field errors |
| `--color-warning-*` | text `#6b4a00`, bg `#fff3d1`, border `#e6cc82` | wrong network, move clock under two minutes |
| `--color-success-*` | text `#1f5f38`, bg `#e6f3ea`, border `#a7d1b5` | confirmed transaction, finished game, connected-network chip |
| `--color-info-*` | text `#24446f`, bg `#e9eff9`, border `#b8c9e6` | neutral notices, “You” badge |

Measured WCAG 2 ratios for every declared foreground/background pair are recorded in
`docs/validation.md`; all text pairs are above 6:1. There is no dark theme; `color-scheme: light` is
declared. The accent means “interactive”: do not use it for static emphasis. Marks X and O are text
in `--color-text`, deliberately not colored.

## Typography

- Families: `--font-sans` = `system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;
  `--font-mono` = `ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace`
  for addresses, hashes and ids (`.mono`, rendered at 0.9375em with `overflow-wrap: anywhere`).
  No web fonts are loaded; nothing external is fetched.
- Scale (rem): `--text-xs` 13px captions and badges; `--text-sm` 14px labels, buttons, muted copy;
  `--text-base` 16px body and inputs (16px keeps iOS Safari from zooming); `--text-lg` 20px `h2`;
  `--text-xl` 28px `h1`; `--text-mark` 32px board marks.
- Weights: 400 body, 500 buttons/labels/values, 600 `h2`/`h3`/badges/turn line, 650 `h1` and marks.
- Line height 1.5 on body, 1.15 on headings. `h1` has `letter-spacing: -0.01em`; badges `0.02em`.
- Wrapping: headings `text-wrap: balance`, paragraphs `text-wrap: pretty` with `max-width: 65ch`
  (`--measure`); `.num` applies `font-variant-numeric: tabular-nums` to balances, stakes, the clock
  and ids; `.nowrap` keeps the short player addresses in list rows from breaking mid-token.
- Links use `text-decoration-thickness: from-font`, `text-underline-position: from-font`,
  `text-decoration-skip-ink: auto`. Font smoothing is set once on `html`.

## Layout

- Containers `.site-header`, `.page`, `.site-footer` share `max-width: 68rem` (`--content-max`) and
  `padding-inline: var(--space-4)`. Spacing steps: `--space-1` 4px, `-2` 8px, `-3` 12px, `-4` 16px,
  `-6` 24px, `-8` 32px. Within a card, related items sit 8–12px apart and groups 16px apart; cards sit
  16px apart (24px column gap on wide screens).
- `.layout` is a single column that becomes a two-column grid (`5fr` / `7fr`) at `min-width: 56rem`,
  the point where two cards fit at their comfortable measure. Left column: “Your NGHT” and “Open a
  game”; right column: the selected game board and the games list. `.column` stacks cards with
  `align-content: start`.
- Card padding grows from `24px 16px` to `24px` at `min-width: 40rem`. Definition lists `.stats`
  are one column; `.stats-inline` uses `repeat(auto-fit, minmax(14rem, 1fr))`.
- The board `.board` is a 3-column grid capped at `20rem`, 4px gaps, square cells with
  `min-height: 3.5rem`. Game rows `.game-row` are a two-column grid (content / “View” button).
- Logical properties (`margin-inline-start`, `padding-inline`, `inset-inline-start`) are used
  wherever direction matters. Verified in the browser at 320, 768 and 1280 CSS px with no
  horizontal overflow (see `docs/validation/e2e-report.json`).

## Elevation & Depth

Flat with one exception: cards carry `--shadow-card` =
`0 1px 2px rgb(28 27 24 / 0.06), 0 4px 12px rgb(28 27 24 / 0.05)` and no border. Structure inside
cards is drawn with `--color-border` lines (game rows, footer rule) and tonal layers
(`--color-bg-subtle` for the board tray and selected row). There are no overlays, dialogs or
z-index stacks other than the skip link (`z-index: 10`).

## Shapes

- `--radius-sm` 6px: buttons, inputs, chips, badges, notices, board cells, game rows.
- `--radius-md` 10px: the board tray (cell radius 6px + 4px padding, concentric).
- `--radius-lg` 12px: cards.
- The winning line is a 3px `--color-text` border on the three cells (`.cell-win`); invalid inputs
  get a 2px `--color-danger-text` border plus a text error.

## Components

All components are plain React function components in `web/src/components/`; they are patterns
with props, not a published library.

- **Button** (`.btn`, `styles.css`): 44px min height, 14px/500 text, `--color-border-strong`
  border on `--color-bg-surface`. Variants: `.btn-primary` (accent fill, exactly one per view: the
  next enabled step, “Switch to Sepolia” or “Connect wallet”), `.btn-quiet` (borderless, for
  Refresh/Disconnect/Dismiss inside control zones), `.btn-small` (32px, inside notices). Disabled
  buttons use native `disabled`, muted text on `--color-bg-subtle`, and always have a visible reason
  beside them. `:active` scales to 0.96 only under `prefers-reduced-motion: no-preference`.
- **Board cell** (`.cell`, `GameBoard.tsx`): square button with a 32px mark, `aria-label`
  “Row r, column c: empty|X|O[, winning line]”; enabled only for the player to move on an empty cell.
- **Notice** (`Notice.tsx`, `.notice-*`): glyph in a ring + visually hidden word (“Warning:”) + body;
  kinds info/warning/error/success; pass `role="status"` or `role="alert"` for live regions.
- **TxStatus** (`TxStatus.tsx`): always-mounted polite `role="status"` for wallet/pending/confirmed
  with explorer link and Dismiss, plus an always-mounted `role="alert"` for failures.
- **StakeSteps** (`StakeSteps.tsx`): the two-step approve-then-pay control shared by Open and Join;
  step 1 becomes “Approved N NGHT” and disables once the allowance covers the stake.
- **Field** (`.field`, `.input`, `.hint`, `.field-error`; `OpenGameForm.tsx`, `GameList.tsx`):
  `<label for>`, 16px input, unit suffix, hint via `aria-describedby`, error text with `aria-invalid`.
- **Stats list** (`.stats`, `.stats-inline`): `dl` of label/value pairs used for balances, players
  and the contracts footer.
- **Chips and badges** (`.chip`, `.chip-ok`, `.badge`, `.badge-you`): connected account, network
  state, game status, “You”.
- **Game row** (`.game-row`, `GameList.tsx`): id, status badge, stake, You badge, players line and
  a “View game n” button with `aria-pressed` for the selected row.
- **AddressLink** (`AddressLink.tsx`): mono explorer link with the full address in the accessible
  name and “opens in a new tab”.
- **Skip link** (`.skip-link`): first focusable element, visible on focus.

## Do's and Don'ts

- Start a new section as a `.card` with an `h2`; keep one `h1` per page and `main` as the only
  primary landmark.
- Choose `.btn-primary` for the single next step in a flow; everything else is `.btn` or
  `.btn-quiet`. Never make a disabled control the only explanation: put the reason in text beside it.
- Use `--color-border-strong` for anything clickable and `--color-border` only for separators.
- Put changing numbers in `.num`; addresses and hashes in `.mono`, full address in the accessible name.
- Status needs a word or glyph with the color (`Notice`), and live updates go through the existing
  `role="status"` / `role="alert"` regions rather than new ones.
- Do not add a dark theme, a second accent, web fonts or motion beyond the 120ms color transitions
  and the reduced-motion-gated press scale.
- Recipe for another page: copy `index.html` and `main.tsx`, import `styles.css`, wrap content in
  `.site-header` / `.page` / `.site-footer`, compose `.card` sections from the components above, and
  load configuration only through `loadDeployment()` in `src/config.ts`.
