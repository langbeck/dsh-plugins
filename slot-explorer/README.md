# Slot Explorer

A durable DSH Web GUI plugin. Plugin Manager shows it as **Slot Explorer**; the
in-page settings panel is the **Slot Explorer dialog**. Two surfaces:

1. **Pills** — every **additive** Web UI slot (`kind: "list"`) gets a small
   bordered pill whose inner text and native tooltip are the slot's key.
   Pills are clickable (and Enter/Space-activatable): clicking one selects that
   slot in the settings dialog and expands the tree down to it. The click stops
   propagating, so the slot owner's own handler (a session row, an action bar)
   does not also fire.
2. **Slot Explorer dialog** — a compact, resizable, draggable panel in
   `shell.overlay` (the frame-wide top layer). Its sidebar has a **search box**
   and a collapsible, file-like tree of slot names (dot segments become
   folders); the center panel controls the selected slot's pill, live:
   - **Multiple pills per slot** — the row under the preview starts with **+**
     (add another pill), then the fixed **All** target and one numbered button
     per pill. Editing All applies to every pill (and clears that field's
     per-pill overrides); selecting a number edits only that pill, whose
     overrides win over All until All touches the same field.
   - **Fill container horizontally** — the pill spans the seat's width.
   - **Fill container vertically** — the pill stretches to the seat's height.
   - **Highlight component** — **border-only** emphasis: the pill border turns
     brand-colored and solid; the background and text colors are untouched.
   - **Border animation** — while highlighted, the border can run one of the
     built-in animations: `Pulse` (default, also used when hovering a sidebar
     slot), `Blink`, `Rainbow`, `Chase`, or `None`. The keyframes are injected
     once into the page head and disposed with the plugin; `prefers-reduced-
     motion` turns them off.
   - **Width / height / roundness (px)** — side-by-side numeric overrides.
     Width/Height are optional: empty means auto, and an explicit value wins
     over the corresponding fill switch. Roundness is a fixed corner radius
     (default `10`, `0` allowed) so resizing the pill no longer stretches its
     rounded ends the way a `999px` stadium radius does.
   - **Margins (px)** — side-by-side `T` / `R` / `B` / `L` overrides (`0` is a
     real value; an empty field removes the margin).

Every pill subscribes to one shared store, so toggling a switch re-renders all
pills of that slot immediately. Settings are **in-memory for the page session**
(no profile or `localStorage` writes); a reload restores the defaults.

## Where it lives

| Path | What it is |
| --- | --- |
| `src/index.js` | Host half (inert): the bundle row exists so the client half is discovered. |
| `src/client.js` | Client half: discovery, pills, store, and the settings dialog. |
| `build.mjs` | Wraps `src/client.js` into `lib/client.js`, the `__ModuleLoader__` bundle. |
| `lib/client.js` | **Generated.** Classic script registering the factory. |
| `cordis.patch.yml` | The bundle layer: one inert row. |
| `locale/en.json`, `icon.svg` | Plugin Manager display metadata. |

## Install

The package is its own bundle (`dsh.bundle.patch`), so install it through the
Plugin Manager rather than by editing profile files:

- in a session: `plugin_manager` `install_bundle` with this directory, or
- from a shell: `dsh plugin --profile web add link:<this directory>`

Then reload the Web GUI page so the boot graph picks up the new client bundle.

## Using the dialog

- The preview box shows every pill of the selected slot; the instance row
  beneath it adds pills and switches the edit target between All and a single
  instance.
- The dialog **starts centered** at 654 × 490, clamped to the viewport and
  painted above the app columns. It is **95% opaque** (5% see-through) by
  default and fades to **60% opaque** while you drag it by the header,
  returning on release.
- Drag the **"Slot Explorer"** header to move it; drag the bottom-right **grip**
  to resize it (minimum 300 × 240, bounded by the viewport). The chosen size
  is kept in memory for the page session.
- Slot names are arranged as a tree grouped by their dot segments. Branches
  **start collapsed**; click a chevron (or a folder row) to open one branch, or
  use the **⊞ / ⊟ buttons beside the search box** to expand or collapse every
  branch at once. Leaf rows select the slot. Search ignores collapsed state and
  auto-expands matching branches.
- Type in the sidebar **search box** to filter slot names (case-insensitive);
  clearing it restores the full tree and the previous collapse state. The
  selected slot stays selected even when filtered out.
- **Double-click the title bar to collapse** the dialog to a compact
  title-bar-only form (200px wide); double-click again to restore its previous
  size and position. Dragging still works while collapsed.
- **Hovering a sidebar slot name highlights that slot's pill in the real UI**
  (the same border treatment and animation as the Highlight checkbox), and the
  sidebar row lights up while hovered.
- Sidebar buttons select a slot (sorted alphabetically). The preview box in the
  center shows the selected pill with its current settings.

## What gets a pill

Only `kind: "list"` slots, because they are additive by contract. The `single`,
`keyed` and `chain` seats are owner-controlled: a foreign entry there either
shadows shipped chrome or needs a key only the owner may choose, so they are
left alone on purpose.

## Caveat

Page-level list slots (`settings.section`, `plugins.tab`, `plugins.item`,
`conversation.view`) are seats where one entry is a whole page, tab, card or
view. The pill is registered there like everywhere else, so those seats gain one
extra entry whose label is the slot key and whose content is the pill.

## Develop

```sh
npm run build   # regenerate lib/client.js
npm test        # build + bundle selftest
```
