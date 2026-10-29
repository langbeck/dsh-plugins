FROM ubuntu:26.04

# Core packages
RUN apt update && apt install -y curl git just ripgrep

# Install node via nvm
ENV NVM_DIR=/root/.nvm
ARG NODE_VERSION=22.23.2

RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash \
    && . "$NVM_DIR/nvm.sh" \
    && nvm install ${NODE_VERSION} \
    && nvm alias default ${NODE_VERSION}

# Add the installed Node version to PATH
ENV PATH="$NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH"

# Update npm
RUN npm install -g npm@latest

# Install DSH
RUN npm config set allow-scripts=@deepseek-ai/dsh-subprocess-local,koffi,node-pty,@google/genai,protobufjs --location=user
RUN npm install -g @deepseek-ai/dsh

# Use corepack to cleanly enable and lock down pnpm
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack install --global pnpm

ENTRYPOINT ["dsh"]
