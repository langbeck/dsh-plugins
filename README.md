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

## Develop

Each plugin builds and tests on its own:

```sh
cd slot-explorer
npm run build   # regenerate lib/client.js from src/client.js
npm test        # build + bundle selftest

cd balance
npm install     # schemastery + esbuild (Host schema, Client JSX build)
npm test        # build + bundle/schema selftest
```
