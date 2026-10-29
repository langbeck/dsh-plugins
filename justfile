# Build tooling for the DSH plugins monorepo.
#
#   just build              build every plugin
#   just build balance      build one plugin
#   just test [plugin...]   run the plugins' tests
#
# `just` recipe names cannot contain ":", so the one-plugin form is
# `just build <plugin>` rather than `just build:<plugin>`.

set shell := ["bash", "-uc"]

# Plugins built by the bare `just build` / `just test` invocation.
plugins := "balance session-settings slot-explorer"

# Build every plugin, or only the named ones.
build *targets:
    #!/usr/bin/env bash
    set -euo pipefail
    targets=({{targets}})
    if [ ${#targets[@]} -eq 0 ]; then
        targets=({{plugins}})
    fi
    for plugin in "${targets[@]}"; do
        if [ ! -f "${plugin}/justfile" ]; then
            echo "unknown plugin: ${plugin}" >&2
            exit 1
        fi
        echo ":: build ${plugin}"
        just --justfile "${plugin}/justfile" build
    done

# Run every plugin's tests, or only the named ones.
test *targets:
    #!/usr/bin/env bash
    set -euo pipefail
    targets=({{targets}})
    if [ ${#targets[@]} -eq 0 ]; then
        targets=({{plugins}})
    fi
    for plugin in "${targets[@]}"; do
        if [ ! -f "${plugin}/justfile" ]; then
            echo "unknown plugin: ${plugin}" >&2
            exit 1
        fi
        echo ":: test ${plugin}"
        just --justfile "${plugin}/justfile" test
    done
