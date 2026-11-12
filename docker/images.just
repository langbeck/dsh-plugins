# Image name and tags shared by the justfile and the build module. A module has
# its own variable scope, so both files import this one. Override with the
# IMAGE, BASE_TAG, and TAG environment variables, e.g.
# `IMAGE=my-dsh TAG=dev just build`.
image := env_var_or_default("IMAGE", "langbeck/dsh")
base_tag := env_var_or_default("BASE_TAG", "base")
tag := env_var_or_default("TAG", "golang")
