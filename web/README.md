# Noughts tic-tac-toe frontend (`lab-tictactoe`)

One static page for the Noughts (NGHT) + `TicTacToeWager` launch on Sepolia: open or join a game,
play on the 3×3 board, watch whose turn it is and the one-hour move clock, claim timeouts, and
withdraw credited NGHT. It reads the deployed addresses and ABIs from the attested deployment
manifest and works as plain files from any static host, IPFS gateway subpath or ENS name.

Sepolia test game with no real value. NGHT comes from swapping Sepolia ETH in the launch pool; the
page shows the current pool rate but does not swap (the approved workflow rules out an in-page swap).

## Layout of the repository

| Path | Contents |
| --- | --- |
| `web/` | Vite + React + TypeScript source, tests, lockfile and build tooling (this directory) |
| `web/deployment/handoff.json`, `web/deployment/network.json` | Copies of the workflow deployment handoff and vetted network block: the build inputs |
| `docs/abi/*.json` | Implementation-derived ABIs at the pinned source commit (`6f07712…`) |
| `dist/` | The committed static export, including `imd-deployment.json` and `abi/*.json` |
| `docs/validation.md`, `docs/validation/` | Validation record, browser screenshots and the end-to-end report |
| `docs/DESIGN.md` | Design documentation of the implemented source |

## Configuration: one source of truth

The page has **no hard-coded addresses, chain id, RPC URL or ABI**. At load it fetches
`./imd-deployment.json` (next to `index.html`), validates its shape, fetches every `abiPath`, and
refuses to run if an ABI's canonical keccak differs from the attested `abiHash`
(`src/config.ts`, `loadDeployment`). Everything else derives from that file:

- contract addresses: `contracts[].address`, looked up by name (`LaunchToken`, `TicTacToeWager`);
- chain: `chainId` and the `network` block (name, public `rpcUrls`, `explorer`, `nativeCurrency`);
- `wallet_addEthereumChain` parameters: derived from `network` (`addChainParamsFrom`) and checked
  at build time to equal the handoff's `walletAddChain` block;
- Uniswap v4 addresses: `network.uniswapV4`; the pool rate is quoted through `uniswapV4.quoter`.

`src/config.ts` also holds the few build-time constants: the manifest URL, the contract names, the
launch pool key parameters from `launch.json` (native ETH pair, fee 3000, tick spacing 60, no hook),
the quote sample size, the poll interval and the game-list limit. `WALLETCONNECT_PROJECT_ID` is
`undefined`: only injected browser wallets (EIP-6963 or `window.ethereum`) are offered. To add
WalletConnect, set the public project id there and add a connector; no secret is needed or allowed.

Reads go through the manifest's public RPC URLs in order (batched JSON-RPC, `viem` fallback
transport) with the connected wallet's provider as the last resort. Transactions are simulated
first, then signed only in the visitor's wallet.

## Install, develop, build

Requires Node 24 (the build script uses Node's built-in TypeScript stripping) and npm.

```sh
cd web
npm ci                    # install exactly the locked dependencies
npm run dev               # generates public/imd-deployment.json + public/abi for the dev server, then vite
npm run typecheck         # tsc --noEmit
npm run build             # prepare manifest, typecheck, vite build -> ../dist, then finalize manifest
npm run preview           # serve the built export locally
```

`npm run build` writes the export to the repository-root `dist/` with a relative base (`./`) and
finishes by running `node scripts/manifest.ts finalize`, which copies the pinned ABIs into
`dist/abi/`, hashes every exported file except the manifest itself (SHA-256, lowercase hex), and
writes `dist/imd-deployment.json` with the handoff's `launchId`, `chainId`, `sourceCommit`,
`attestationHash`, contract set and the `network` block copied unchanged. Rebuild the manifest after
any change to the export; `npm run verify:manifest` recomputes everything and fails on any
difference. `dist/` must be committed together with the source and `package-lock.json`.

If the deployment handoff changes, replace `web/deployment/handoff.json` and
`web/deployment/network.json`, make sure `docs/abi/<Contract>.json` still hashes to the new
`abiHash` (the build fails otherwise), and rebuild.

## Validation

```sh
npm test                  # vitest: unit tests + UI interaction tests against the real contracts on anvil
npm run test:unit         # only the pure unit tests
npm run test:e2e          # headless Chromium against the built dist/ (after npm run build)
npm run verify:manifest   # dist/imd-deployment.json matches the export and the handoff
```

- `test/lib.test.ts`: ABI hash binding, manifest validation, board/outcome decoding, formatting,
  the switch/add-chain sequence, and revert-reason copy decoded from real reverts.
- `test/app.test.tsx`: renders the page with a mocked EIP-1193 wallet against a local **anvil**
  chain (chain id 11155111) running the real `LaunchToken` and `TicTacToeWager` bytecode compiled
  by Foundry from this repository: disconnected state, wrong network with `wallet_addEthereumChain`,
  approve → open, approve → join, moves to a win, withdraw, timeout claim after an hour, cancel,
  wallet rejection, list filters and lookup. Needs `anvil` and `forge` on the PATH.
- `test/e2e/run.mjs`: one foreground command that serves `dist/` under a `/preview/` subpath, opens
  it in headless Chromium (Playwright core, using the Chromium found in `~/.cache/ms-playwright` or
  `PLAYWRIGHT_CHROMIUM`), checks the disconnected page at 1280/768/320 px against the real public
  Sepolia RPCs, refuses a tampered ABI, and drives the full connected flow on anvil with an
  injected mock wallet. Screenshots and `e2e-report.json` land in `docs/validation/`.

What was **not** exercised: a real wallet extension, a broadcast transaction on Sepolia, screen
readers, forced-colors mode and browser-native zoom. See `docs/validation.md`.

## Contract actions on the page

| Action | Control | Prerequisite shown on the page |
| --- | --- | --- |
| `approve(game, stake)` on NGHT | “Approve N NGHT” (step 1 of Open and Join) | wallet on Sepolia, stake entered |
| `open(stake)` | “Open game” | allowance ≥ stake, balance ≥ stake |
| `join(id)` | “Join game” on an open game you did not create | allowance ≥ stake, balance ≥ stake |
| `cancel(id)` | “Cancel game” on your own open game | nobody has joined |
| `move(id, cell)` | the nine board cells | game active and it is your turn |
| `claimTimeout(id)` | “Claim timeout” for the waiting player | move clock expired |
| `withdraw()` | “Withdraw N NGHT” | withdrawable > 0 |

Reads shown live: NGHT balance, allowance to the game, withdrawable credit, `gameCount()`,
`game(id)` for the newest 50 games (older ones by id lookup), the board, the player to move and
the move deadline, plus the Uniswap v4 quoter's price for 0.01 ETH.
