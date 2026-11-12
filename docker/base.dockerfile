# DSH base image: the harness plus the tools every session needs, with no
# language-specific toolchain. Language images (e.g. golang.dockerfile) build
# on top of this one.
#
# Published as langbeck/dsh:base.

FROM ubuntu:26.04

ENV DEBIAN_FRONTEND=noninteractive

# Core packages. `just` is not reliably packaged in every Ubuntu release, so it
# is installed from its official release tarball below instead of apt.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        jq \
        procps \
        ripgrep \
        unzip \
        xz-utils \
        libatomic1 \
    && rm -rf /var/lib/apt/lists/*

ARG JUST_VERSION=1.36.0
RUN curl -fsSL "https://github.com/casey/just/releases/download/${JUST_VERSION}/just-${JUST_VERSION}-x86_64-unknown-linux-musl.tar.gz" \
        | tar -xz -C /usr/local/bin just \
    && just --version

# Install node via nvm
ENV NVM_DIR=/root/.nvm
ARG NODE_VERSION=26.13.1
ARG COREPACK_VERSION=0.36.0
ARG NVM_VERSION=0.41.0
ARG NPM_VERSION=12.2.2

RUN curl -o- "https://raw.githubusercontent.com/nvm-sh/nvm/v${NVM_VERSION}/install.sh" | bash \
    && . "$NVM_DIR/nvm.sh" \
    && nvm install ${NODE_VERSION} \
    && nvm alias default ${NODE_VERSION}

# Add the installed Node version to PATH
ENV PATH="$NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH"

# Update npm
RUN npm install -g npm@${NPM_VERSION}

# Install DSH
RUN npm config set allow-scripts=@deepseek-ai/dsh-subprocess-local,koffi,node-pty,@google/genai,protobufjs --location=user
RUN npm install -g @deepseek-ai/dsh

# Use corepack to cleanly enable and lock down pnpm
RUN npm install -g corepack@${COREPACK_VERSION}
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack install --global pnpm

ENTRYPOINT ["dsh"]
