# Slot Explorer

A durable DSH Web GUI plugin: every **additive** Web UI slot (`kind: "list"`)
gets a clickable pill showing the slot key, and the **Slot Explorer** dialog
styles those pills live. Plugin Manager lists it as **Slot Explorer**.

- Clicking a pill (or Enter/Space) selects its slot in the dialog and expands
  the tree to it. The click stops propagating, so the slot owner's handler does
  not also fire.
- The dialog starts centered (654 × 490), is draggable by its header and
  resizable by its bottom-right grip, and collapses to a title bar on
  double-click. It is 95% opaque and fades while being dragged.
- The sidebar has a search box over a collapsible tree of slot names (dot
  segments become folders); hovering a name highlights that slot's pill.
- A slot can carry multiple pills: **+** adds one, **All** edits every pill, and
  a numbered button edits only its own (per-pill overrides win over All).
- Controls: fill horizontally/vertically, border-only **highlight**, border
  animation (`Pulse` by default, plus `Blink`, `Rainbow`, `Chase`, `None`;
  disabled under `prefers-reduced-motion`), width/height/roundness in px, and
  `T`/`R`/`B`/`L` margins.
- Settings are in memory for the page session; a reload restores the defaults.

## Install

The package is its own bundle (`dsh.bundle.patch`), so it installs without
editing profile files.

### From the public repository

Use **Plugins → Add plugin** in the Web GUI and paste:

```
github:langbeck/dsh-plugins#main&path:/slot-explorer
```

or from a shell:

```sh
dsh plugin --profile web add 'github:langbeck/dsh-plugins#main&path:/slot-explorer'
```

`&path:/slot-explorer` is required because this plugin is a package inside a
multi-plugin repository. `#main` tracks the branch; use a tag or commit for a
fixed version (the lockfile pins the commit either way).

### From npm

Once published:

```sh
dsh plugin --profile web add dsh-plugin-slot-explorer
```

The same package name works in **Plugins → Add plugin**.

### From a local checkout

```sh
dsh plugin --profile web add link:/path/to/dsh-plugins/slot-explorer
```

or, in a session, call `plugin_manager` → `install_bundle` with the absolute
directory.

After a **Web** install, click **Enable now** (or switch the bundle on under
**Installed plugins**); `dsh plugin add` selects the new bundle itself. Then
reload the Web GUI page — or restart the profile if the client bundle still
doesn't appear. Remove with:

```sh
dsh plugin --profile web remove dsh-plugin-slot-explorer
```

## What gets a pill

Only `kind: "list"` slots, because they are additive by contract. The `single`,
`keyed`, and `chain` seats are owner-controlled, so they are left alone.

Page-level list slots (`settings.section`, `plugins.tab`, `plugins.item`,
`conversation.view`) are seats where one entry is a whole page, tab, card, or
view. The pill registers there too, so those seats gain one extra entry labeled
with the slot key whose content is the pill.

## Layout

| Path | What it is |
| --- | --- |
| `src/index.js` | Host half (inert): the bundle row exists so the client half is discovered. |
| `src/client.js` | Client half: discovery, pills, store, and the dialog. |
| `build.mjs` | Wraps `src/client.js` into `lib/client.js`. |
| `lib/client.js` | **Generated** module-loader bundle. |
| `cordis.patch.yml` | The bundle layer: one inert row. |
| `locale/en.json`, `icon.svg` | Plugin Manager display metadata. |

## Develop

```sh
npm run build   # regenerate lib/client.js
npm test        # build + bundle selftest
```
