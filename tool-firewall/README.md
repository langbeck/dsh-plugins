# Tool Firewall

Inspects DSH tool calls before they execute. The plugin runs entirely
in-process: a deterministic structural analyzer always runs, and an optional
local Transformers.js pipeline adds semantic alignment, a text-classifier
signal, and an output guard for indirect prompt injection.

## What it does

For every `tools/pre-execute` call:

1. Extract the command-like text and, for shell tools, a model-supplied
   description.
2. Run structural checks for destructive commands, download-to-shell,
   reverse shells, encoded/eval execution, privilege escalation, and similar
   high-risk patterns.
3. Optionally compare command and description embeddings with MiniLM and/or
   classify the command text with a configured model.
4. Deny with a structured `TOOL_FIREWALL_BLOCKED` tool error, or delegate to
   the next policy with `next()`.

PTC/`run_code` sub-calls traverse the same hook. File contents from
`write`/`edit` are not treated as shell commands; generic tools get structural
checks over command-like, URL, and path fields only.

For selected `tools/post-execute` results (default: `web_search`, `web_fetch`,
and `skill`), the output guard scans text blocks for indirect prompt injection.
A detected result is replaced with a warning (quarantine) or returned as a tool
error, depending on configuration.

## Sidebar stats card

The sidebar footer gains a compact stats card similar to Balance. The whole card
is a button that opens the configuration dialog.

The card data is a list of string pairs in `src/client/index.jsx`:

```js
[
  { label: 'Firewall', value: 'On' },
  { label: 'Embedding', value: 'On' },
]
```

The component also accepts localized `{ labelKey, valueKey }` entries. The
current defaults derive Firewall, Embedding, Classifier, and Mode from the live
config form, so they update immediately after Save. The sidebar also shows
separate **Embedding model** and **Classifier model** states: Ready, Loading,
Disabled, or Error. Disabled is muted, Off is orange, and Error is red with the
error text available as a tooltip and in the dialog banner. A **Blocks / total**
row is sampled from the Host's `POST /api/tool-firewall-stats` route every five
seconds and counts firewall inspections and denials since the plugin reloaded.

## Configuration

The Plugin Manager row has a configure page. Save writes the values through DSH
`configForms`; **Restore defaults** clears the profile overrides, so the defaults
declared in `src/index.js`/`src/config.js` apply again. Config fields are
volatile: saves are applied live and rebuild the evaluator without restarting
the Host.

The settings dialog splits the sections into **General**, **Detection**,
**Models**, **Bounds and cache**, and **Logs** tabs. It opens at a fixed size
independent of tab content, can be dragged by its header, and can be resized
from its bottom-right corner. The size is stored in browser localStorage and
restored on later openings; the position returns to center when reopened. Save and Restore defaults are pinned in a fixed footer at the bottom of the dialog.

The Logs tab polls the Host and shows one collapsible row per intercepted tool
call with a bounded, basic-redacted command/description preview, structural and
model scores, decision, reason, cache/bypass state, and duration. Logs are kept
in memory (ring of 200) and reset when the plugin reloads.

Important fields:

- `enabled`
- `maliceThreshold`, `alignmentThreshold`
- `bypassRegex`, `shellTools`
- `embeddingEnabled`, embedding model/revision
- `classifierEnabled`, classifier model/revision/hostile labels
- `outputGuardEnabled`, output guard model/revision/labels
- `outputGuardTools`, `outputGuardThreshold`, `outputGuardMode`
- output result caps, chunking, deadline, and failure mode
- `modelTimeoutMs`, `semanticFailure`
- structural/model input caps and decision-cache bounds

Invalid explicit configuration fails plugin activation. `semanticFailure:
"open"` keeps structural checks active when models are unavailable; `"closed"`
blocks the call instead.

## Models and caching

- Embedding model: `Xenova/all-MiniLM-L6-v2`, pinned revision, quantized ONNX,
  CPU inference in the Host process.
- Transformers.js in Node uses its prebuilt ONNX Runtime CPU backend; this
  plugin does not compile native code. The ONNX native binding cannot be
  loaded by a replacement worker after a plugin reload, so inference stays in
  the Host process. Cached models load in well under a second.
- The text classifier is optional and disabled by default. No classifier model
  ships with the plugin; configure a pinned Transformers.js-compatible model
  before enabling it.
- The output guard defaults to
  `Horizon-Labs/prompt-injection-guard-small`, pinned to a specific revision and
  loaded only when enabled. It scans selected tool results in chunks and caps
  the input before classification. For `web_fetch`, the trusted `Fetched …`
  wrapper and external-content notice are reconstructed from the canonical
  URL/status and stripped before scanning; the inspector shows URL, status,
  and fetched body separately.
- Models are cached under the DSH home (`tool-firewall/models`).
- A tool call while models are loading triggers another warmup. The sidebar
  shows Model Ready/Loading/Disabled/Error, and the Logs tab shows the
  inference error when one is present.
- Model failures are logged without command text and follow `semanticFailure`.
- The decision cache stores only hashes, scores, and decisions; command text is
  never written to it.

### Upgrading from the worker build

Earlier builds ran Transformers.js in a worker thread. ONNX Runtime’s native
binding cannot be loaded again by the Host process after that worker has
registered it, producing `Module did not self-register`. The current build runs
inference in the Host process, but a DSH process that already loaded the worker
build must be **restarted once** to clear the stale native binding. Plugin
reloads after that no longer create workers.

## Security scope

This is an input firewall plus an optional output guard, not a sandbox.
Structural checks are deterministic but conservative; semantic checks can
produce false positives and false negatives. Output scanning covers only the
configured tools and a bounded prefix of each result. It does not prove shell
semantics or replace DSH approval/sandbox policy.

## Development

```sh
npm install
npm test          # build the client bundle and run offline tests
npm run bench     # optional real-model latency benchmark
```

Enable the plugin through the Plugin Manager after installing the package as a
DSH bundle.
