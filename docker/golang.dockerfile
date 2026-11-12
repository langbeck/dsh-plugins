# DSH image with the Go toolchain and gopls, built on the base image.
#
# Build base.dockerfile first, then this file.
# Published as langbeck/dsh:golang.

FROM langbeck/dsh:base

# Go toolchain. gopls v0.24.0 declares `go 1.27.0`, so the distro's Go package
# is too old to build it; install the official toolchain instead.
ARG GO_VERSION=1.27.3
ARG TARGETARCH=amd64
RUN curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-${TARGETARCH}.tar.gz" -o /tmp/go.tgz \
    && tar -C /usr/local -xzf /tmp/go.tgz \
    && rm /tmp/go.tgz

ENV GOROOT=/usr/local/go
ENV GOPATH=/root/go
# Appended rather than prepended so the base image's Node binaries keep
# precedence, as they did when this was a single Dockerfile.
ENV PATH="$PATH:$GOROOT/bin:$GOPATH/bin"

# gopls: the MCP server (`gopls mcp`) needs both `go` and the gopls binary on
# PATH at runtime, since gopls shells out to the toolchain to load packages.
ARG GOPLS_VERSION=v0.24.0
RUN go install "golang.org/x/tools/gopls@${GOPLS_VERSION}" \
    && go version \
    && gopls version \
    && go clean -cache -modcache
