# Session Settings

A DSH Web GUI plugin bundle with one Host row and one Client bundle. It adds a
header action to the current Session that opens a dialog with three tabs:

- **Tools** — a Plugin-Manager-style list of the Session's tools (from its last
  request header, or its tool history before the first request): icon, name,
  description, and an enable/disable switch on the right. The switch track is
  green when enabled (auto-approved) and red when blocked; the knob stays
  white. The second line shows the Session invocation count and blocked state.
  Clicking a row opens a wider detail dialog with a disabled form preview of
  its parameter schema, the raw JSON Schema, and recent calls. A pinned line at
  the top lists the disabled tool names and offers name/invocation sorting while
  the rows scroll.
- **Settings** — switch the Session's permission preset (Read only, Workspace
  write, Full access) in one row, and inspect the effective sandbox mode and
  approval policy.
- **Commands** — the Host slash commands visible to the Session's live Agent:
  name, description, input hint, and attachment support.

Tool policy is enforced by a Host `approval/request` answerer: every request
resolves `allowed-once` unless the tool name is blocked for that Session, in
which case it resolves `rejected`. Only the **tool name** is available to an
answerer — not the call arguments — so this is a coarse, tool-level policy. The
per-Session block list is currently **in-memory** and resets when the Host
process restarts.

> **Security:** by default this plugin auto-approves **every** non-blocked tool
> approval for every Session, including sandbox-escalation requests. Use Block
> to reject a tool. Do not install this plugin where human approval of tools is
> required.

## Layout

| Path | What it is |
| --- | --- |
| `src/index.js` | Host entry: authenticated `/api/session-settings` route, preset writes, snapshots, and the block-list approval answerer. |
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
- Tool policies are name-level and not argument-aware.
- The viewer is read-only. Invoking tools/commands (Postman-style) is a later
  phase.
