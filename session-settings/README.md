# Session Settings

A DSH Web GUI plugin bundle with one Host row and one Client bundle. It adds a
header action to the current Session that opens a dialog with three tabs:

- **Settings** — switch the Session's configured permission preset, inspect the
  effective sandbox mode and approval policy, and manage the plugin's
  tool-level approval allow-list.
- **Tools** — the tools enabled for the Session (from its last request header,
  or its tool history before the first request): name, description, parameters
  JSON Schema, and whether the tool requests deferred loading.
- **Commands** — the Host slash commands visible to the Session's live Agent:
  name, description, input hint, and attachment support.

The allow-list is enforced by a Host `approval/request` answerer: a listed
tool's approval request resolves `allowed-once`; every other request delegates
to the normal human answerer. Only the **tool name** is available to an
answerer — not the call arguments — so this is a coarse, tool-level grant. The
allow-list is currently **in-memory per Session** and resets when the Host
process restarts; `defaultAllowedTools` in the plugin Config seeds every
Session.

> **Security:** a listed tool is auto-approved for the whole Session. Do not
> list tools whose every call should require a human, and do not list `bash`
> unless you intend to auto-approve sandbox escalations.

## Layout

| Path | What it is |
| --- | --- |
| `src/index.js` | Host entry: Config, authenticated `/api/session-settings` route, preset writes, snapshots, and the approval answerer. |
| `src/tools.js` | Pure tool/command snapshot helpers. |
| `src/client/index.jsx` | Client entry: header trigger, overlay entry, route client. |
| `src/client/components/` | Header action and the tabbed settings dialog. |
| `src/client/lib/` | Route client, stores, hooks, styles, locale. |
| `build.mjs` | Bundles the JSX Client with esbuild into the module-loader factory. |
| `lib/client.js` | **Generated** bundle. |

## Develop

```sh
npm install
just build      # bundle src/client/index.jsx -> lib/client.js
just test       # build + selftest
```

From the repository root, use `just build session-settings` /
`just test session-settings`.

## Limitations

- Tool details are the model-facing schema; Host-only metadata (output schema,
  timeout, presentation callbacks) is not exposed by the Session log.
- Commands come from the Host command registry; purely Client-side command
  actions are not visible here.
- The allow-list is tool-level and not argument-aware.
- The viewer is read-only. Invoking tools/commands (Postman-style) is a later
  phase.
