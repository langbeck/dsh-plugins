# DSH Plugins

Durable plugins for the DeepSeek Harness Web GUI. Each plugin is a
self-contained DSH bundle — its own `package.json`, `cordis.patch.yml`,
client half, and tests in its own directory.

## Plugins

| Plugin | What it does |
| --- | --- |
| [Slot Explorer](slot-explorer/) | Pills every additive Web UI slot with its key and styles those pills live in a draggable **Slot Explorer** dialog. |
| [Balance](balance/) | Shows the DeepSeek account balance as a full-width row in the sidebar footer, summed per currency, with a Configure page in the Plugin Manager. |

## Install

In the Web GUI, open **Plugins → Add plugin** and paste the spec; from a
shell, pass the same spec to `dsh plugin`:

```sh
# Slot Explorer
dsh plugin --profile web add 'github:langbeck/dsh-plugins#main&path:/slot-explorer'

# Balance
dsh plugin --profile web add 'github:langbeck/dsh-plugins#main&path:/balance'
```

The `&path:<directory>` part is required because each plugin is a package
inside this multi-plugin repository; replace `#main` with a tag or commit to
pin a version. Once published to npm, the package names work instead
(`dsh-plugin-slot-explorer`, `dsh-plugin-balance`). See each plugin's README
for configuration and uninstall steps.

## Layout

| Path | What it is |
| --- | --- |
| `slot-explorer/` | Slot Explorer plugin. |
| `balance/` | Balance plugin. |
| `wip/` | Local scratch packages, git-ignored. |

## Build

The repository uses [just](https://github.com/casey/just): one `justfile` at the
root and one in each plugin folder.

```sh
just build              # build every plugin
just build balance      # build one plugin
just test               # run every plugin's tests
just test balance       # run one plugin's tests
```

Inside a plugin directory, `just build` and `just test` operate on that plugin
only. `just` recipe names cannot contain `:`, so the one-plugin form is
`just build <plugin>` (`just build:<plugin>` is not valid just syntax).

Install npm dependencies where needed first (`cd balance && npm install`;
`slot-explorer` has none). The plain npm scripts (`npm run build`, `npm test`)
remain available.
