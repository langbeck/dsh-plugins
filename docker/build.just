# Image build recipes, declared as `mod build` by the justfile beside this
# file. Invoke as `just build` (both images), `just build base`, or
# `just build golang`.

# Modules do not inherit the parent justfile's variables, so import the shared
# image name/tags; the recipes below run in this directory, so the Dockerfiles
# and the build context resolve as written.
import 'images.just'

# Build both images: the base image first, then the Go image on top.
default: base golang

# Build the base image.
base:
    podman build --file base.dockerfile --tag {{image}}:{{base_tag}} .

# Build the Go image on top of the base.
golang: base
    podman build --file golang.dockerfile --tag {{image}}:{{tag}} .
