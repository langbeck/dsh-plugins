# Balance

A durable DSH Web GUI plugin: a **full-width row in the sidebar footer** shows
the DeepSeek account balance for every currency, e.g.
`$0.00 USD + ¥2.55 CNY`. The footer lays its actions out in one flex row; while
this block is present that row wraps, so it takes the whole width and the other
footer actions sit above it. It renders two rows:

1. **Balance** — a bold `Balance` label in the same tertiary gray as the
   currency codes, then the amounts (currency codes bold); the compact age of the last successful
   read (`now`, `5min`, `2h`, `3d`) is vertically centered at the right.
2. **Session** — an estimate of the current Session's cost
   (`$0.0032 USD`) including its subagent children.

Topped-up and granted balances are **summed per currency** — the pill never
separates the two kinds. Currencies render with their symbol and code (USD `$`,
CNY `¥`); other currencies fall back to the code. The pill is hidden while the
account is signed out, still loading, or the balance cannot be read.

## Host cost service

The Host provides a `balanceCost` service for other Host plugins:

- `read(sessionId, signal)` → the same Session-cost snapshot the route returns
- `await limitOf(sessionId)` / `await setLimit(sessionId, limitUsd | null)`
- `await turnLimitOf(sessionId)` / `await setTurnLimit(sessionId, limitUsd | null)`
- `pricingState()` → pricing readiness, fetch time, revision, and error

The browser route `/api/balance-session-cost` delegates to this service, so
other plugins and the Web Client share one pricing cache and one cost fold.
The route also returns `limitUsd`, `remainingUsd`, `turnLimitUsd`, active-turn
`turnSpentUsd`/`turnRemainingUsd`, and the persistence state of each limit.

### Session and turn limits

The Web client registers a Client-owned **Budget** command with a wallet icon.
It opens a dialog where you choose **Session** or **Turn**, see the current
limit, and enter an amount:

- absolute: `5`, `$5`, or `5.00`
- relative: `+2` or `-2`
- clear: `off`

The dialog submits to the Host route `/api/balance-limit`; there are no
limit slash commands in the command menu. The route/write logic is Host-owned,
so limits still survive reloads and restarts.

Both caps are stored in separate `balance` storage domains keyed by Session
id; if a domain is unavailable that cap falls back to memory.

The Host `agent/pre-step` guard checks the turn budget first, then the Session
cap. It asks **Allow step** / **Increase turn limit** / **Cancel** for the turn
budget, and **Allow turn** / **Increase limit** / **Cancel** for the Session
cap. Increasing either limit opens a second question with defaults (`+$1`,
`+$5`, `+$10`, double) plus a custom amount.

The turn budget is a guardrail, not a hard token-level limit: the guard runs
before each model step, so one model call can still overshoot before the next
step is blocked. Approvals are scoped to one step for the turn budget and to
the rest of the turn for the Session cap.

The sidebar's Session block gains a `Limit $5.00 ($2.50 left)` row while a
Session cap is set, and a `Turn $2.00 USD ($0.40 left)` row while a turn budget
is set. The turn remainder is shown only while that Session is running and is
removed when the turn ends. An
overage greater than $0.001 renders as a negative remainder, e.g.
`Limit $2.00 USD (-$0.10 left)`.

## Install

The package is its own bundle (`dsh.bundle.patch`), so it installs without
editing profile files.

### From the public repository

Use **Plugins → Add plugin** in the Web GUI and paste:

```
github:langbeck/dsh-plugins#main&path:/balance
```

or from a shell:

```sh
dsh plugin --profile web add 'github:langbeck/dsh-plugins#main&path:/balance'
```

`&path:/balance` is required because this plugin is a package inside a
multi-plugin repository. `#main` tracks the branch; use a tag or commit for a
fixed version.

### From npm

Once published:

```sh
dsh plugin --profile web add dsh-plugin-balance
```

The same package name works in **Plugins → Add plugin**.

### From a local checkout

```sh
pnpm install --dir /path/to/dsh-plugins/balance   # the Host Config schema needs schemastery
dsh plugin --profile web add link:/path/to/dsh-plugins/balance
```

or, in a session, call `plugin_manager` → `install_bundle` with the absolute
directory.

After a **Web** install, click **Enable now** (or switch the bundle on under
**Installed plugins**); `dsh plugin add` selects the new bundle itself. Then
reload the Web GUI page. Remove with:

```sh
dsh plugin --profile web remove dsh-plugin-balance
```

## Configuration

The plugin row carries a Config schema and a **Configure** control in the
Plugin Manager; it no longer adds a separate Balance card to the Plugins page.
The resolved values are read live by the client half.

| Field | Default | Meaning |
| --- | --- | --- |
| Refresh interval (seconds) | `60` | How often to re-read the balance. `0` disables automatic refresh. |
| Show zero balances | on | Show a currency whose balance is exactly zero. |
| Show currency codes | on | Append `USD` / `CNY` after the amount. |
| Pricing refresh interval (seconds) | `3600` | How often Host-side session-cost pricing is re-read from OpenRouter. |

The same values can be set in a profile patch:

```yaml
- id: balance
  name: 'dsh-plugin-balance'
  config:
    refreshSeconds: 120
    showZeroBalances: false
    showCurrencyName: true
```

### When it reads the balance

The balance is read when the plugin mounts, whenever the page becomes visible,
every `refreshSeconds` (default 60; `0` disables the timer), and again when a
session finishes running (a turn ends). The compact age at the right edge of
the row (`now`, `5min`, `2h`, …) is the age of the last **successful** read, so
a stale value is visible at a glance. A turn's cost is not part of the
turn-end event, so the turn-end read is a heuristic: whatever the Platform
wallet reports at that moment is shown, and the next poll picks up a delayed
settlement.

## Session cost

The footer's `$0.0032 USD` line is an estimate of the current Session, including
its subagent descendants:

- **Currency:** prices are USD, so the estimate is a USD equivalent. The
  Session log and the account endpoint do not report which wallet currency a
  request was charged in; see the limitation below.
- **Pricing source:** OpenRouter's public `deepseek/*` model list, fetched by
  the Host at startup and every `pricingRefreshSeconds` (default one hour). The
  DSH model (`deepseek-flash`, `deepseek-v4-pro`) is mapped to OpenRouter's
  `~deepseek/*-latest` alias and priced from that alias target's concrete row,
  so a new release is picked up by the next refresh.
- **Effective time:** every settled model call is priced at its step-start UTC
  instant, applying OpenRouter's `overrides` (DeepSeek's weekday peak windows);
  off-peak is the base rate.
- **Accounting:** each call's cache-read, uncached-input, cache-write and output
  tokens are priced separately. The fold matches token-meter's retry semantics
  (a retried step replaces its previous settlement) and ignores fork-inherited
  events, so a forked Session is not charged for its parent's history.
- **Scope:** subagent Sessions are added to the total. A Session that the Host
  cannot query, or a model with no pricing row, contributes unpriced calls; the
  displayed number stays an approximation and does not mark the lower bound.

The suffix is an estimate, not a bill. Known limitations:

- **Search / Fetch fees are excluded.** They are billed per successful request
  (US$0.75 per 1,000; free for Harness server-side tool calls until
  2026-11-01 00:00 Beijing time) and are not part of token usage, so a
  token-based estimate is a lower bound when those tools run.
- **Chinese public holidays are not modelled.** DeepSeek treats them as
  off-peak; OpenRouter's weekday overrides do not, so a holiday peak window can
  be overpriced.
- **Price revisions are applied to the whole historical estimate.** The estimate
  is recomputed with the latest fetched table, not the table in effect when each
  call ran.
- **Charged currency is not exposed.** DSH records token usage, not the wallet
  currency a request settled against; the Platform deducts granted balance
  before topped-up balance, and the wallet query lists balances per currency,
  but there is no per-request charge-currency field. The estimate therefore
  stays in USD instead of guessing.
- **Unmapped models stay unpriced.** A non-DeepSeek provider or a renamed model
  without a matching pricing row is reported as unpriced rather than guessed.
- **Failed attempts without reported usage are invisible**, so the estimate can
  undercount tokens a provider billed.

## Layout

| Path | What it is |
| --- | --- |
| `src/index.js` | Host entry: `Config` schema, pricing lifecycle, and the authenticated `/api/balance-session-cost` route. |
| `src/host/pricing.js` | OpenRouter fetch/cache, DeepSeek alias-target mapping, and effective peak/off-peak prices. |
| `src/host/session-cost.js` | Session-log fold, retry/inherited handling, subagent roll-up, and per-model cost aggregation. |
| `src/host/util.js` | Host-side error/number helpers. |
| `src/client/index.jsx` | Client entry: slot registrations, balance polling, layout rule, and cost-tracker wiring. |
| `src/client/components/BalanceRow.jsx` | The full-width `Balance`/`Session` footer block. |
| `src/client/components/SettingsForm.jsx` | Settings page used by the row Configure control and the plugin item. |
| `src/client/lib/*.js` | Money/time formatting, config normalization, stores, hooks, inline styles, and the cost client. |
| `src/client/constants.js`, `src/client/locale.js` | Shared constants/layout CSS and the in-app dictionaries. |
| `build.mjs` | Bundles `src/client/index.jsx` with esbuild and wraps it in the page's module-loader factory. |
| `lib/client.js` | **Generated** module-loader bundle. |
| `cordis.patch.yml` | The bundle layer: one inert row. |
| `locale/en.json`, `locale/zh.json`, `icon.svg` | Plugin Manager display metadata. |

## Develop

From this directory:

```sh
npm install     # schemastery (Host schema) and esbuild (Client JSX build)
just build      # bundle src/client/index.jsx -> lib/client.js
just test       # build + 124 selftest checks
```

From the repository root, use `just build balance` / `just test balance`. The
npm equivalents (`npm run build`, `npm test`) also work.

The Client half is JSX. esbuild leaves `react` and `react/jsx-runtime` external;
the page's shared module table provides both, and `build.mjs` wraps the CommonJS
output in the `window.__ModuleLoader__` factory the Web GUI loads.
