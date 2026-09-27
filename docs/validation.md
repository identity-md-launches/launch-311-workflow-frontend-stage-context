# Validation record: lab-tictactoe frontend

Worker-side validation of the static frontend for the Noughts (NGHT) + TicTacToeWager launch on
Sepolia (launch `14ab260c-c63f-40c2-b1c4-8dbc94c39f89`, source commit `6f077123…79e3`). This is the
worker's report, not an independent network certification. Publication checks (CID, asset hashes,
RPC chain id, contract code) run later and are not claimed here.

## 1. Scope and assumptions

- **Reviewed:** the single page in `dist/index.html` (built from `web/`): header with wallet
  status, “Your NGHT” (balance, allowance, withdrawable, Withdraw, pool rate), “Open a game”
  (stake, Approve, Open), the selected game board (players, stake, turn, move clock, cells, Join /
  Cancel / Claim timeout, outcome), the games list (filter, lookup, refresh) and the contracts footer.
  States: loading, deployment-config failure, no wallet, wrong network, connected, wallet prompt,
  pending, confirmed, failed/rejected, open / active / finished (win, timeout) / cancelled games.
- **Export:** repository-root `dist/` (7 assets, 573,272 bytes) plus `dist/imd-deployment.json`.
- **Deployment handoff:** `.imd/reads/deployment.json` and `.imd/reads/network.json`, copied to
  `web/deployment/` as build inputs. Both ABI hashes verified: canonical JSON (sorted keys, no
  whitespace) keccak-256 of `docs/abi/LaunchToken.json` = `f36d2fe2…f577`, of
  `docs/abi/TicTacToeWager.json` = `89d7c2ae…5aa4`, equal to the handoff. Live Sepolia checks
  before building: both addresses hold code, `TicTacToeWager.token()` returns the LaunchToken
  address, `MIN_STAKE` = 1e18, `gameCount()` = 0, the ETH/NGHT pool is initialised and the quoter
  returns a price for 0.01 ETH.
- **Inferred choices:** the approved workflow says “no in-page swap”, so the page explains that NGHT
  comes from swapping Sepolia ETH in the launch pool and shows the current pool rate from the
  manifest's Uniswap v4 quoter (read-only simulation; every Uniswap address comes from the copied
  `network` block). No swap or Permit2 approval exists on the page. Approvals are for the exact stake
  to the game contract. The repository root is outside the write scope, so `DESIGN.md` lives at
  `docs/DESIGN.md` and the frontend README at `web/README.md`.
- **Exclusions:** no dark theme, no localisation, no dialogs, no WalletConnect (no project id was
  supplied; injected wallets only), no real transaction broadcast on Sepolia.

## 2. Coverage (Better Interface, six domains)

| Domain | Status | Inspected states / evidence | Not performed |
| --- | --- | --- | --- |
| Accessibility | Checked | Source: native `button`/`a`/`input`/`select`; every input has `<label for>`; `aria-describedby` hint + `aria-invalid` error; skip link; one `h1`, one `main`, `lang="en"`; always-mounted `role="status"` and `role="alert"`; `prefers-reduced-motion` gates the only motion. Browser (`test/e2e/run.mjs`, audit in `docs/validation/e2e-report.json`): no unnamed controls, no unlabelled inputs, no targets under 24px at 1280/768/320; Tab order recorded; focus ring `solid 2px rgb(29,85,168)` offset 2px seen on a neutral button, the primary button, a board cell and a link (screenshots `a-desktop-focus-*.png`, `b-desktop-focus-*.png`). | Screen-reader session; forced-colors mode; browser-native 200% zoom (only narrow viewports were tested); automated axe-style audit. |
| Layout | Checked | Logical properties throughout; content-driven breakpoints at 40rem and 56rem; DOM order = reading order (wallet → open → board → list → contracts). Browser: `scrollWidth == innerWidth` at 320, 768 and 1280; full-page screenshots at each width and of connected states. | RTL mirror; widths other than the three tested. |
| Writing | Checked | Sentence case everywhere; verb-first buttons (“Approve 5 NGHT”, “Open game”, “Claim timeout”, “Withdraw 10 NGHT”); each disabled action has a reason beside it; errors are instructions (“Stake at least 1 NGHT.”, “Approve enough NGHT for this stake first.”); empty states point forward; link names describe the destination. | Nothing; source review suffices for this domain. |
| Typography | Checked | Semantic scale in `styles.css`; headings descend 28 → 20 → 16px; body 16px, UI 14px, captions 13px, nothing under 400 weight; inputs 16px; `tabular-nums` on balances, ids and the clock; `text-wrap: balance/pretty`; measure 65ch; `overflow-wrap: anywhere` on hashes. Browser: wrapping checked at 320px (finding 3 fixed and rechecked). | Real content lengths beyond the test data (addresses/hashes are fixed-length so risk is low). |
| Colors | Checked | One neutral ramp, one accent, four status colors, all as role tokens; contrast computed from declared pairs (table below), every text pair ≥ 6.19:1, control boundaries ≥ 3.43:1 after finding 2. Rendered screenshots confirm the pairs sit on the backgrounds assumed. | Rendered-pixel measurement in the browser (values were computed from the declared tokens; there are no translucent surfaces, gradients or images under text). |
| UI | Checked | Concentric radii (cell 6px + 4px gap = tray 10px); shadows only for card elevation, borders for structure; transitions name exact properties (120ms color/background/border); press scale 0.96 under reduced-motion opt-in; spinner only under `no-preference`; every state (hover, focus, active, disabled, loading, empty, error, success) defined in CSS and exercised in the browser flow. | Animations replayed at 10% speed (the only motion is the spinner and a 120ms color change). |

Measured contrast (WCAG 2 luminance ratio, computed from the token values in `web/src/styles.css`):

| Pair | Ratio | Need |
| --- | --- | --- |
| text `#1c1b18` on page `#f6f5f2` / surface `#ffffff` / subtle `#eeece7` | 15.80 / 17.22 / 14.59 | 4.5 |
| secondary `#5a564e` on page / surface / subtle (disabled buttons, badges) | 6.70 / 7.30 / 6.19 | 4.5 |
| accent `#1d55a8` links on surface / page; white on accent / accent-hover | 7.20 / 6.60; 7.20 / 9.49 | 4.5 |
| danger `#9a2626` on `#fbecec`; warning `#6b4a00` on `#fff3d1`; success `#1f5f38` on `#e6f3ea`; info `#24446f` on `#e9eff9` | 6.83; 7.29; 6.68; 8.53 | 4.5 |
| control border `#8f8a80` on white; focus ring `#1d55a8` on page / surface | 3.43; 6.60 / 7.20 | 3.0 |
| separator border `#d8d4cc` on white (structure only, not a control boundary after finding 2) | 1.48 | n/a |
| disabled empty cell `#f6f5f2` on tray `#eeece7` (inactive component, exempt) | 1.08 | n/a |

## 3. Findings and fixes

| # | Severity | Location | Evidence | Fix | Recheck |
| --- | --- | --- | --- | --- | --- |
| 1 | HIGH (misleading action) | `web/src/components/StakeSteps.tsx:32` | UI test: after approval the step-1 button read “Approved 5 NGHT” but stayed enabled, inviting a second, useless approval transaction. | `canApprove` now requires `!approved`; the button disables once the allowance covers the stake. | `test/app.test.tsx` asserts the button is disabled; e2e pass B confirmed. |
| 2 | MEDIUM (component contrast) | `web/src/styles.css:644` | Playable board cells used the separator border `#d8d4cc` on white: 1.48:1, below the 3:1 component boundary. | `.cell:not(:disabled)` uses `--color-border-strong` (3.43:1); disabled cells keep the light border (inactive, exempt). | Ratio recomputed; `b-your-move.png` and `b-desktop-focus-board-cell.png`. |
| 3 | LOW (wrapping) | `web/src/components/GameList.tsx:82`, `web/src/styles.css:588–596` | 320px screenshot: the O address in a game row broke mid-token (“0x3C44… / 93BC”) because `.mono` allows `overflow-wrap: anywhere`. | Players line is a wrapping flex row of two `.nowrap` spans. | `b-w320-active-board.png` shows “X 0x7099…79C8” and “O 0x3C44…93BC” on separate lines, unbroken. |
| 4 | LOW (test defect, not product) | `web/test/app.test.tsx` | The rejection test matched an always-mounted empty `role="alert"` before its text updated; the wrong-chain test compared against the public RPC list although the fixture points at anvil. | Wait for the alert text; compare with the fixture's RPC list. | Suite green, 21/21. |

No blockers remain. Deliberate choices kept: quiet (borderless) buttons for Refresh, Disconnect and
Dismiss inside control zones; native `disabled` with an adjacent reason instead of `aria-disabled`;
X and O rendered as uncolored text.

## 4. Verification

Commands run from `web/` on this worker (Node v24.21.0, npm 11.19.0, forge/anvil 1.8.3):

| Command | Outcome |
| --- | --- |
| `node scripts/manifest.ts prepare` | wrote 2 ABI files + dev manifest; ABI hashes matched the handoff |
| `npx tsc -p tsconfig.json --noEmit` | exit 0 |
| `npx vite build` | exit 0; `dist/index.html`, `assets/index-CQDy1UrG.js` (540 kB), `assets/index-Dgaw8l7_.css`, `assets/ccip-CIUK6y-U.js`, `favicon.svg` |
| `node scripts/manifest.ts finalize` | `dist/imd-deployment.json`: 7 assets, 573,272 bytes, all SHA-256 lowercase hex |
| `node scripts/manifest.ts verify` | “matches the export (7 assets) and the handoff”; derived `wallet_addEthereumChain` params equal `network.json`'s `walletAddChain` |
| `npx vitest run` | 2 files, 21 tests passed (`test/lib.test.ts` 17, `test/app.test.tsx` 4) in ~18 s against anvil chain id 11155111 running the real bytecode from `forge build` |
| `node test/e2e/run.mjs` | exit 0, “no problems”; 16 screenshots in `docs/validation/screenshots/`, report in `docs/validation/e2e-report.json` |

Interaction coverage (mocked EIP-1193 wallet, real contracts on anvil; both in vitest/jsdom and in
headless Chromium against the built export served under `/preview/`):

- Disconnected: “No browser wallet found” notice, actions disabled with reasons, list loads from
  views (“No games yet”), every configured address linked to the explorer; Chromium pass A read the
  live Sepolia pool rate through the manifest's public RPCs (“0.01 ETH ≈ 495,993.93 NGHT”) with no
  console errors or failed requests at 1280, 768 and 320 px.
- Tampered configuration: an ABI served as `[]` is refused with “does not match its attested hash”
  and no contract is shown (`a-desktop-abi-mismatch.png`).
- Wrong network: connecting on chain 1 shows the warning and a single “Switch to Sepolia”;
  `wallet_switchEthereumChain` fails with 4902, `wallet_addEthereumChain` is called with exactly the
  handoff parameters (RPC list swapped for anvil in the fixture), then the switch succeeds.
- Approve → Open (5 NGHT): Open disabled until allowance ≥ stake; balance 1,000 → 995, allowance
  5 → 0 after open; game #0 auto-selected with Cancel offered to the creator; the sent transactions
  target the token then the game contract.
- Approve → Join as player 2; “X to move”, clock “1:00:00”, Claim timeout disabled with its reason.
- Five moves alternating accounts to a top-row win; winning cells marked; “X (…) won. 10 NGHT
  credited”; Withdraw 10 NGHT → balance 1,005.
- Timeout: second game, `evm_increaseTime 3601`, clock “expired”, Claim timeout enabled and
  confirmed, 2 NGHT credited.
- Cancel: third game cancelled, 1 NGHT credited. Wallet rejection (4001): alert “Withdraw NGHT
  failed. Request cancelled in the wallet. Nothing was sent.”, no `eth_sendTransaction` forwarded.
- Filters (all/open/mine), id lookup with a not-found message, Refresh.
- Unit level: revert reasons decoded from real reverts (`GameNotFound`, `StakeTooLow`), outcome
  reconstruction for win/draw/timeout from the packed board, amount parsing/formatting, canonical
  ABI hashing, manifest validation.

Keyboard walk (pass A, desktop): Skip to content → NGHT token link → stake input → Refresh →
filter select → game id input → Look up → LaunchToken link, each with the 2px outline computed;
focused states screenshotted for a neutral button, the primary button, a board cell and a link.

## 5. Limitations and untested live-chain behaviour

- No transaction was broadcast on Sepolia and no real wallet extension (MetaMask, Rabby) was
  driven; wallet behaviour was mocked through EIP-1193 with anvil's unlocked accounts. Real
  wallets may surface their own chain-mismatch or gas dialogs.
- The public RPC fallback order and the wallet-provider fallback were not failure-injected; only
  the happy path through the first RPC (Sepolia) and anvil was observed.
- Screen readers, forced-colors mode, browser-native zoom, RTL and physical touch devices were not
  tested. The Playwright audit is not an accessibility conformance claim.
- Contrast values are computed from the declared tokens, not sampled from rendered pixels.
- The page relies on the deadline race semantics documented by the contract: a late move mined
  before `claimTimeout` still counts. The page warns from two minutes before the deadline; the race
  itself was not reproduced.
- IPFS gateway hosting and ENS resolution were not exercised; the export was served from a
  `/preview/` subpath, which exercises the relative base.

## 6. Completion

**Complete for the stated scope.** Source, lockfile, `dist/` export, `dist/imd-deployment.json`,
this record, screenshots and `docs/DESIGN.md` are committed together. Remaining limitations are the
untested live-wallet and assistive-technology checks listed above.
